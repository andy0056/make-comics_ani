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
  getCharacterDnaProfiles,
  getStoryCharacters,
  getStoryWorld,
} from "@/lib/db-actions";
import { runContinuityGuardian } from "@/lib/continuity-guardian";
import { createDefaultStoryWorld, normalizeStoryWorldPayload } from "@/lib/story-world";

const continuityCheckRequestSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("guardian")) {
    return apiJson({ violations: [] }, { requestId });
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
      return apiError({
        status: 400,
        error: "Invalid JSON body",
        requestId,
      });
    }

    const parsedBody = continuityCheckRequestSchema.safeParse(requestBody);
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

    const [worldRecord, storyCharacters, dnaProfiles] = await Promise.all([
      getStoryWorld(storyAccess.story.id),
      getStoryCharacters(storyAccess.story.id),
      getCharacterDnaProfiles(storyAccess.story.id),
    ]);

    const world = worldRecord
      ? normalizeStoryWorldPayload({
          timeline: worldRecord.timeline,
          locations: worldRecord.locations,
          canonRules: worldRecord.canonRules,
        })
      : createDefaultStoryWorld();

    const violations = runContinuityGuardian({
      storyId: storyAccess.story.id,
      prompt: parsedBody.data.prompt,
      storyWorld: world,
      storyCharacters,
      dnaProfiles,
    });

    return apiJson({ violations }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/continuity/check:POST",
      requestId,
      error,
      message: "Failed to run continuity check",
    });
  }
}
