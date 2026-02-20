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
import {
  createStoryRemixFromSource,
  getStoryRemixLineage,
} from "@/lib/db-actions";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const createRemixRequestSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  note: z.string().trim().max(280).optional(),
  remixType: z.enum(["fork", "alt", "what_if"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("remix_graph")) {
    return apiError({
      status: 404,
      error: "Remix Graph is disabled",
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

    const parsedBody = createRemixRequestSchema.safeParse(requestBody);
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
      requiredPermission: "view",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    const result = await createStoryRemixFromSource({
      sourceStoryId: storyAccess.story.id,
      userId,
      title: parsedBody.data.title,
      note: parsedBody.data.note,
      remixType: parsedBody.data.remixType ?? "fork",
    });
    const remixLineage = await getStoryRemixLineage(result.story.id);

    return apiJson(
      {
        story: {
          id: result.story.id,
          slug: result.story.slug,
          title: result.story.title,
        },
        copiedPageCount: result.copiedPageCount,
        remixLineage,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/remix:POST",
      requestId,
      error,
      message: "Failed to create remix",
    });
  }
}
