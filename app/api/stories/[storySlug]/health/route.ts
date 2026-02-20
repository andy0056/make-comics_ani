import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
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
import { createDefaultStoryWorld, normalizeStoryWorldPayload } from "@/lib/story-world";
import { buildStoryHealthReport } from "@/lib/story-health";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
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

    const { storySlug } = await params;
    if (!storySlug) {
      return apiError({
        status: 400,
        error: "Story slug is required",
        requestId,
      });
    }

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
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

    if (!isFeatureEnabled("health_score")) {
      return apiJson(
        {
          report: {
            storyId: storyAccess.story.id,
            clarityScore: 50,
            continuityScore: 60,
            pacingScore: 55,
            nextActions: [],
          },
        },
        { requestId },
      );
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

    const report = buildStoryHealthReport({
      storyId: storyAccess.story.id,
      pages: storyAccess.pages,
      world,
      storyCharacters,
      dnaProfiles,
    });

    return apiJson({ report }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/health:GET",
      requestId,
      error,
      message: "Failed to build story health report",
    });
  }
}
