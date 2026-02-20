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
import {
  getCharacterDnaProfiles,
  getStoryCharacters,
  getStoryWorld,
} from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { resolveTogetherApiKey } from "@/lib/comic-generation";
import { generateNarrativeAutopilotPlan } from "@/lib/narrative-autopilot";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";
import {
  createDefaultStoryWorld,
  normalizeStoryWorldPayload,
} from "@/lib/story-world";

const autopilotPlanRequestSchema = z.object({
  storySlug: z.string().trim().min(1),
  targetPageCount: z.number().int().min(1).max(5).optional().default(3),
  dialogueMode: z
    .enum(["concise", "balanced", "cinematic"])
    .optional()
    .default("balanced"),
  audienceMode: z
    .enum(["general", "kids", "teen"])
    .optional()
    .default("general"),
  cameraDirectionMode: z
    .enum(["balanced", "kinetic", "cinematic", "graphic_novel"])
    .optional()
    .default("balanced"),
  directorTranscript: z.string().trim().min(10).max(3000).optional(),
  apiKey: z.string().trim().min(1).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("autopilot")) {
    return apiError({
      status: 404,
      error: "Narrative autopilot is disabled",
      requestId,
    });
  }

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

    const parsedBody = autopilotPlanRequestSchema.safeParse(requestBody);
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
    const [storyCharacters, storyWorld, characterDnaProfiles] = await Promise.all(
      [
        getStoryCharacters(storyAccess.story.id),
        getStoryWorld(storyAccess.story.id),
        getCharacterDnaProfiles(storyAccess.story.id),
      ],
    );

    const plan = await generateNarrativeAutopilotPlan({
      client,
      storyTitle: storyAccess.story.title,
      storyDescription: storyAccess.story.description,
      style: storyAccess.story.style,
      nextPageNumber: storyAccess.pages.length + 1,
      targetPageCount: parsedBody.data.targetPageCount,
      dialogueMode: parsedBody.data.dialogueMode,
      audienceMode: parsedBody.data.audienceMode,
      cameraDirectionMode: parsedBody.data.cameraDirectionMode,
      directorTranscript: parsedBody.data.directorTranscript,
      recentPrompts: storyAccess.pages.map((page) => page.prompt),
      storyCharacters,
      storyWorld: storyWorld
        ? normalizeStoryWorldPayload({
            timeline: storyWorld.timeline,
            locations: storyWorld.locations,
            canonRules: storyWorld.canonRules,
          })
        : createDefaultStoryWorld(),
      characterDnaProfiles,
    });

    return apiJson(
      {
        plan,
        usesOwnApiKey: apiKeyResult.usesOwnApiKey,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/autopilot/plan:POST",
      requestId,
      error,
      message: "Failed to build narrative autopilot plan",
    });
  }
}
