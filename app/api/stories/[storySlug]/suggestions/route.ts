import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getStoryCharacters } from "@/lib/db-actions";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";
import { buildContinuationSuggestions } from "@/lib/consistency-engine";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);
  try {
    if (!isFeatureEnabled("continuation_suggestions")) {
      return apiError({
        status: 404,
        error: "Feature disabled",
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
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    const storyCharacters = await getStoryCharacters(storyAccess.story.id);
    const suggestions = buildContinuationSuggestions({
      storyTitle: storyAccess.story.title,
      recentPrompts: storyAccess.pages.map((page) => page.prompt),
      characterNames: storyCharacters.map((character) => character.name),
    });

    return apiJson({ suggestions }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/suggestions:GET",
      requestId,
      error,
      message: "Failed to generate suggestions",
    });
  }
}
