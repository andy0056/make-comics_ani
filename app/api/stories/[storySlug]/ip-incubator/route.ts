import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import {
  getCharacterDnaProfiles,
  getStoryCharacters,
  getStoryRemixLineage,
  getStoryWorld,
} from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { buildIpIncubatorReport } from "@/lib/ip-incubator";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isFeatureEnabled("creator_economy")) {
      return apiError({
        status: 404,
        error: "Creator economy layer is disabled",
        requestId,
      });
    }

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

    const [world, characters, characterDnaProfiles, remixLineage] =
      await Promise.all([
        getStoryWorld(storyAccess.story.id),
        getStoryCharacters(storyAccess.story.id),
        getCharacterDnaProfiles(storyAccess.story.id),
        getStoryRemixLineage(storyAccess.story.id),
      ]);

    const report = buildIpIncubatorReport({
      story: storyAccess.story,
      pages: storyAccess.pages,
      world,
      characters,
      characterDnaProfiles,
      remixLineage,
    });

    return apiJson(
      {
        report,
        access: storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/ip-incubator:GET",
      requestId,
      error,
      message: "Failed to build IP incubator report",
    });
  }
}
