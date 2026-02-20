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
import { getStoryWorld, upsertStoryWorld } from "@/lib/db-actions";
import {
  createDefaultStoryWorld,
  normalizeStoryWorldPayload,
  updateStoryWorldRequestSchema,
} from "@/lib/story-world";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("canon_core")) {
    return apiError({
      status: 404,
      error: "Story world feature is disabled",
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

    const worldRecord = await getStoryWorld(storyAccess.story.id);
    const world = worldRecord
      ? normalizeStoryWorldPayload({
          timeline: worldRecord.timeline,
          locations: worldRecord.locations,
          canonRules: worldRecord.canonRules,
        })
      : createDefaultStoryWorld();

    return apiJson({ world }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/world:GET",
      requestId,
      error,
      message: "Failed to fetch story world",
    });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("canon_core")) {
    return apiError({
      status: 404,
      error: "Story world feature is disabled",
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

    const parsedBody = updateStoryWorldRequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const worldRecord = await upsertStoryWorld(storyAccess.story.id, parsedBody.data);
    const world = normalizeStoryWorldPayload({
      timeline: worldRecord.timeline,
      locations: worldRecord.locations,
      canonRules: worldRecord.canonRules,
    });

    return apiJson({ world }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/world:PUT",
      requestId,
      error,
      message: "Failed to update story world",
    });
  }
}
