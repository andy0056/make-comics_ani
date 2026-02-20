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
import { getStoryUniverseGraph } from "@/lib/db-actions";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const querySchema = z.object({
  maxNodes: z.coerce.number().int().min(1).max(80).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("shared_universe")) {
    return apiError({
      status: 404,
      error: "Shared Universe is disabled",
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

    const parsedQuery = querySchema.safeParse({
      maxNodes: request.nextUrl.searchParams.get("maxNodes"),
    });
    if (!parsedQuery.success) {
      return apiError({
        status: 400,
        error: "Invalid query params",
        details: parsedQuery.error.flatten(),
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

    const universe = await getStoryUniverseGraph({
      storyId: storyAccess.story.id,
      userId,
      maxNodes: parsedQuery.data.maxNodes,
    });

    return apiJson({ universe }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/universe:GET",
      requestId,
      error,
      message: "Failed to load shared universe",
    });
  }
}
