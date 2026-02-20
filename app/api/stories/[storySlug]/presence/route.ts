import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { buildCoEditConflictResolution } from "@/lib/coedit-conflict-resolution";
import {
  listActiveStoryEditLocks,
  listRecentStoryEditorPresence,
  pruneExpiredStoryEditLocks,
  pruneStoryEditorPresence,
  releaseStoryEditLocksForUser,
  removeStoryEditorPresence,
  upsertStoryEditorPresence,
} from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { formatPresenceUserLabel } from "@/lib/story-coedit";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const heartbeatRequestSchema = z.object({
  pageNumber: z.number().int().min(1).max(5000).optional(),
  activePanel: z.string().trim().max(40).optional().nullable(),
});

function mapPresenceRows(
  rows: Awaited<ReturnType<typeof listRecentStoryEditorPresence>>,
  currentUserId: string,
) {
  return rows.map((entry) => ({
    id: entry.id,
    userId: entry.userId,
    userLabel: formatPresenceUserLabel(entry.userId),
    pageNumber: entry.pageNumber,
    activePanel: entry.activePanel,
    lastSeenAt: entry.lastSeenAt,
    isCurrentUser: entry.userId === currentUserId,
  }));
}

async function mapLockRows(
  rows: Awaited<ReturnType<typeof listActiveStoryEditLocks>>,
  storyId: string,
  currentUserId: string,
) {
  return Promise.all(
    rows.map(async (lock) => {
      const isCurrentUser = lock.userId === currentUserId;
      const resolution = isCurrentUser
        ? null
        : await buildCoEditConflictResolution({
            storyId,
            lockedByUserId: lock.userId,
            requestingUserId: currentUserId,
            expiresAt: lock.expiresAt,
          });

      return {
        id: lock.id,
        resource: lock.resource,
        userId: lock.userId,
        userLabel: formatPresenceUserLabel(lock.userId),
        reason: lock.reason,
        expiresAt: lock.expiresAt,
        isCurrentUser,
        resolution,
      };
    }),
  );
}

async function getPresenceSnapshot({
  storyId,
  userId,
}: {
  storyId: string;
  userId: string;
}) {
  await Promise.all([
    pruneStoryEditorPresence({ storyId, maxIdleSeconds: 90 }),
    pruneExpiredStoryEditLocks({ storyId }),
  ]);

  const [presenceRows, lockRows] = await Promise.all([
    listRecentStoryEditorPresence({ storyId, withinSeconds: 45 }),
    listActiveStoryEditLocks({ storyId }),
  ]);
  const mappedLocks = await mapLockRows(lockRows, storyId, userId);

  return {
    presence: mapPresenceRows(presenceRows, userId),
    locks: mappedLocks,
    serverTime: new Date().toISOString(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isFeatureEnabled("co_edit_live")) {
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
      requiredPermission: "view",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    const snapshot = await getPresenceSnapshot({
      storyId: storyAccess.story.id,
      userId,
    });
    return apiJson(
      {
        ...snapshot,
        access: storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/presence:GET",
      requestId,
      error,
      message: "Failed to load presence snapshot",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isFeatureEnabled("co_edit_live")) {
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
      requiredPermission: "view",
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

    const parsedBody = heartbeatRequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const payload = parsedBody.data;
    await upsertStoryEditorPresence({
      storyId: storyAccess.story.id,
      userId,
      pageNumber: payload.pageNumber ?? 1,
      activePanel: payload.activePanel ?? null,
    });

    const snapshot = await getPresenceSnapshot({
      storyId: storyAccess.story.id,
      userId,
    });
    return apiJson(
      {
        ...snapshot,
        access: storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/presence:POST",
      requestId,
      error,
      message: "Failed to sync presence",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isFeatureEnabled("co_edit_live")) {
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
      requiredPermission: "view",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    await Promise.all([
      removeStoryEditorPresence({
        storyId: storyAccess.story.id,
        userId,
      }),
      releaseStoryEditLocksForUser({
        storyId: storyAccess.story.id,
        userId,
      }),
    ]);

    return apiJson({ success: true }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/presence:DELETE",
      requestId,
      error,
      message: "Failed to clear presence",
    });
  }
}
