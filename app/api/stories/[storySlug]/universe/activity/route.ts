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
import { buildUniverseActivityFeed } from "@/lib/universe-activity";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const querySchema = z.object({
  maxNodes: z.coerce.number().int().min(1).max(80).optional(),
  days: z.coerce.number().int().min(1).max(90).optional(),
  limit: z.coerce.number().int().min(1).max(120).optional(),
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
      days: request.nextUrl.searchParams.get("days") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
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
    const activity = buildUniverseActivityFeed({
      graph,
      windowDays: parsedQuery.data.days ?? 14,
      maxEvents: parsedQuery.data.limit ?? 30,
    });

    return apiJson(
      {
        storyId: storyAccess.story.id,
        activity,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/universe/activity:GET",
      requestId,
      error,
      message: "Failed to load universe activity",
    });
  }
}

