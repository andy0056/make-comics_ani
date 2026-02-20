import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { getStoryUniverseGraph } from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";
import { buildUniverseInteractiveState } from "@/lib/universe-interactive";

const querySchema = z.object({
  maxNodes: z.coerce.number().int().min(1).max(80).optional(),
  focusStoryId: z.string().trim().min(1).max(128).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isFeatureEnabled("shared_universe")) {
      return apiError({
        status: 404,
        error: "Shared universe feature is disabled",
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

    const parsedQuery = querySchema.safeParse({
      maxNodes: request.nextUrl.searchParams.get("maxNodes") ?? undefined,
      focusStoryId: request.nextUrl.searchParams.get("focusStoryId") ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiError({
        status: 400,
        error: "Invalid query parameters",
        details: parsedQuery.error.flatten(),
        requestId,
      });
    }

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
      userId,
      unauthorizedMode: "not_found",
      requiredPermission: "view",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    const graph = await getStoryUniverseGraph({
      storyId: storyAccess.story.id,
      userId,
      maxNodes: parsedQuery.data.maxNodes ?? 50,
    });
    const interactive = buildUniverseInteractiveState({
      graph,
      focusStoryId: parsedQuery.data.focusStoryId,
    });

    return apiJson(
      {
        storyId: storyAccess.story.id,
        interactive,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/universe/interactive:GET",
      requestId,
      error,
      message: "Failed to load interactive universe state",
    });
  }
}
