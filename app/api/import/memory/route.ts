import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Together from "together-ai";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { resolveTogetherApiKey } from "@/lib/comic-generation";
import {
  getCreatorTwinProfile,
  getStoryCharacters,
  getStoryWorld,
  replaceStoryCharacters,
  upsertCreatorTwinProfile,
  upsertStoryWorld,
} from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  extractFallbackMemoryFromNotes,
  mergeImportedCharacters,
  mergeStoryWorld,
  normalizeImportedMemory,
  toStoryWorldPayload,
} from "@/lib/memory-importer";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";
import {
  createDefaultStoryWorld,
  normalizeStoryWorldPayload,
} from "@/lib/story-world";

const importMemoryRequestSchema = z.object({
  storySlug: z.string().trim().min(1),
  notes: z.string().trim().min(20).max(8000),
  apply: z.boolean().optional().default(false),
  apiKey: z.string().trim().min(1).optional(),
});

function extractJsonObject(raw: string): string | null {
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function buildMemoryImportPrompt(notes: string): string {
  return `You are a story memory extraction assistant.
Extract structured story memory from creator notes.
Return VALID JSON only in this exact shape:
{
  "world": {
    "timeline": [{ "title": "string", "note": "string" }],
    "locations": [{ "name": "string", "description": "string" }],
    "canonRules": ["string"]
  },
  "characters": [
    {
      "name": "string",
      "role": "string",
      "appearance": "string",
      "personality": "string",
      "speechStyle": "string",
      "isLocked": true
    }
  ],
  "preferences": {
    "pageCount": 2 | 3 | 4,
    "dialogueMode": "concise" | "balanced" | "cinematic",
    "audienceMode": "general" | "kids" | "teen"
  }
}

Rules:
- Capture only concrete facts from notes.
- Keep timeline/location entries concise and deduplicated.
- Keep up to 6 characters maximum.
- preferences are optional; include only when notes imply clear preference.

Creator notes:
${notes}`;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    const { userId } = await auth();
    if (!userId) {
      return apiError({
        status: 401,
        error: "Authentication required",
        requestId,
      });
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return apiError({
        status: 400,
        error: "Invalid JSON body",
        requestId,
      });
    }

    const parsedBody = importMemoryRequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug: parsedBody.data.storySlug,
      userId,
      unauthorizedMode: "unauthorized",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    let modelCandidate: unknown = null;
    let source: "model" | "fallback" = "fallback";
    const fallbackPayload = extractFallbackMemoryFromNotes(parsedBody.data.notes);

    try {
      const apiKeyResult = await resolveTogetherApiKey({
        userId,
        bodyApiKey: parsedBody.data.apiKey,
        headerApiKey: request.headers.get("x-api-key"),
        requestId,
      });
      if ("response" in apiKeyResult) {
        return apiKeyResult.response;
      }

      const client = new Together({ apiKey: apiKeyResult.apiKey });
      const response = await client.chat.completions.create({
        model: "Qwen/Qwen3-Next-80B-A3B-Instruct",
        messages: [
          {
            role: "system",
            content:
              "You extract structured memory for a comic editor. Return valid JSON only.",
          },
          {
            role: "user",
            content: buildMemoryImportPrompt(parsedBody.data.notes),
          },
        ],
        temperature: 0.2,
        max_tokens: 1600,
      });

      const content = response.choices[0]?.message?.content?.trim() ?? "";
      const json = extractJsonObject(content);
      if (json) {
        modelCandidate = JSON.parse(json);
        source = "model";
      }
    } catch {
      source = "fallback";
    }

    const normalized = normalizeImportedMemory(
      modelCandidate ?? fallbackPayload,
      parsedBody.data.notes,
    );

    const importedWorld = toStoryWorldPayload(normalized.payload.world);
    const importedCharacters = normalized.payload.characters;
    const suggestedPreferences = normalized.suggestedPreferences;

    let applied = false;
    let appliedWorld = importedWorld;
    let appliedCharacters = importedCharacters;

    if (parsedBody.data.apply) {
      const [currentWorldRecord, currentCharacters] = await Promise.all([
        getStoryWorld(storyAccess.story.id),
        getStoryCharacters(storyAccess.story.id),
      ]);

      const currentWorld = currentWorldRecord
        ? normalizeStoryWorldPayload({
            timeline: currentWorldRecord.timeline,
            locations: currentWorldRecord.locations,
            canonRules: currentWorldRecord.canonRules,
          })
        : createDefaultStoryWorld();

      const mergedWorld = mergeStoryWorld(currentWorld, importedWorld);
      const worldRecord = await upsertStoryWorld(storyAccess.story.id, mergedWorld);
      appliedWorld = normalizeStoryWorldPayload({
        timeline: worldRecord.timeline,
        locations: worldRecord.locations,
        canonRules: worldRecord.canonRules,
      });

      const mergedCharacters = mergeImportedCharacters(
        currentCharacters,
        importedCharacters,
      );
      const persistedCharacters = await replaceStoryCharacters(
        storyAccess.story.id,
        mergedCharacters,
      );
      appliedCharacters = persistedCharacters.map((character) => ({
        name: character.name,
        role: character.role ?? "",
        appearance: character.appearance ?? "",
        personality: character.personality ?? "",
        speechStyle: character.speechStyle ?? "",
        isLocked: character.isLocked,
      }));

      if (suggestedPreferences && isFeatureEnabled("twin")) {
        const existingProfile = await getCreatorTwinProfile(userId);
        await upsertCreatorTwinProfile(userId, {
          preferredArcPageCount: suggestedPreferences.pageCount,
          preferredDialogueMode: suggestedPreferences.dialogueMode,
          preferredAudienceMode: suggestedPreferences.audienceMode,
          metadata: existingProfile?.metadata ?? {},
        });
      }

      applied = true;
    }

    return apiJson(
      {
        import: {
          source,
          applied,
          world: applied ? appliedWorld : importedWorld,
          characters: applied ? appliedCharacters : importedCharacters,
          suggestedPreferences,
        },
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/import/memory:POST",
      requestId,
      error,
      message: "Failed to import memory",
    });
  }
}

