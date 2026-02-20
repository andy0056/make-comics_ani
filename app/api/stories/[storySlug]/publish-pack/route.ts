import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";
import {
  buildStoryPublishingPack,
  DISTRIBUTION_CHANNELS,
  EMOTION_LOCK_PROFILES,
  STYLE_MORPH_MODES,
} from "@/lib/publishing-distribution";

const publishPackRequestSchema = z.object({
  storyUrl: z.string().trim().url().optional(),
  channels: z.array(z.enum(DISTRIBUTION_CHANNELS)).min(1).max(4).optional(),
  tone: z.enum(["cinematic", "hype", "educational"]).optional(),
  styleMorphMode: z.enum(STYLE_MORPH_MODES).optional(),
  emotionLock: z.enum(EMOTION_LOCK_PROFILES).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("publishing")) {
    return apiError({
      status: 404,
      error: "Publishing flywheel feature is disabled",
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

    const { storySlug } = await params;
    if (!storySlug) {
      return apiError({
        status: 400,
        error: "Story slug is required",
        requestId,
      });
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      requestBody = {};
    }

    const parsedBody = publishPackRequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
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

    try {
      const pack = buildStoryPublishingPack({
        story: storyAccess.story,
        pages: storyAccess.pages,
        storyUrl: parsedBody.data.storyUrl,
        channels: parsedBody.data.channels,
        tone: parsedBody.data.tone,
        styleMorphMode: parsedBody.data.styleMorphMode,
        emotionLock: parsedBody.data.emotionLock,
      });

      return apiJson({ pack }, { requestId });
    } catch (error) {
      if (error instanceof Error) {
        return apiError({
          status: 400,
          error: error.message,
          requestId,
        });
      }

      return apiError({
        status: 400,
        error: "Could not build publishing pack",
        requestId,
      });
    }
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/publish-pack:POST",
      requestId,
      error,
      message: "Failed to build publishing pack",
    });
  }
}
