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
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";
import { generateVoiceCastSfxPack } from "@/lib/voice-cast-sfx";

const checkpointSchema = z.object({
  id: z.string().trim().min(1).max(120),
  pageNumber: z.number().int().min(1).max(999),
  beatTitle: z.string().trim().min(2).max(120),
  beatSummary: z.string().trim().min(6).max(360),
  panelPlan: z
    .array(
      z.object({
        panelNumber: z.number().int().min(1).max(5),
        camera: z.string().trim().min(2).max(120),
        action: z.string().trim().min(2).max(260),
        visualFocus: z.string().trim().min(2).max(160),
      }),
    )
    .min(1)
    .max(8),
  dialoguePlan: z
    .array(
      z.object({
        speaker: z.string().trim().min(1).max(80),
        line: z.string().trim().min(1).max(220),
        intent: z.string().trim().min(1).max(120),
      }),
    )
    .min(1)
    .max(8),
});

const voicePackRequestSchema = z.object({
  storySlug: z.string().trim().min(1),
  checkpoints: z.array(checkpointSchema).min(1).max(6),
  directorTranscript: z.string().trim().min(10).max(3000).optional(),
  audienceMode: z.enum(["general", "kids", "teen"]).optional().default("general"),
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

    const parsedBody = voicePackRequestSchema.safeParse(requestBody);
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
      requiredPermission: "view",
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
    const voicePack = await generateVoiceCastSfxPack({
      client,
      storyTitle: storyAccess.story.title,
      style: storyAccess.story.style,
      checkpoints: parsedBody.data.checkpoints,
      audienceMode: parsedBody.data.audienceMode,
      directorTranscript: parsedBody.data.directorTranscript,
    });

    return apiJson(
      {
        voicePack,
        usesOwnApiKey: apiKeyResult.usesOwnApiKey,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/autopilot/voice-pack:POST",
      requestId,
      error,
      message: "Failed to generate voice cast and SFX pack",
    });
  }
}
