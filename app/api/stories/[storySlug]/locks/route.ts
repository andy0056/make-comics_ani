import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  acquireStoryEditLock,
  listActiveStoryEditLocks,
  pruneExpiredStoryEditLocks,
  releaseStoryEditLock,
} from "@/lib/db-actions";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { buildCoEditConflictResolution } from "@/lib/coedit-conflict-resolution";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { formatPresenceUserLabel, STORY_EDIT_RESOURCE } from "@/lib/story-coedit";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const lockResourceSchema = z.enum([
  STORY_EDIT_RESOURCE.title,
  STORY_EDIT_RESOURCE.pages,
  STORY_EDIT_RESOURCE.characterBible,
]);

const acquireLockRequestSchema = z.object({
  resource: lockResourceSchema,
  ttlSeconds: z.number().int().min(5).max(300).optional(),
  reason: z.string().trim().max(120).optional().nullable(),
});

const releaseLockRequestSchema = z.object({
  resource: lockResourceSchema,
});

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

    await pruneExpiredStoryEditLocks({ storyId: storyAccess.story.id });
    const locks = await listActiveStoryEditLocks({
      storyId: storyAccess.story.id,
    });
    const mappedLocks = await mapLockRows(locks, storyAccess.story.id, userId);
    return apiJson(
      {
        locks: mappedLocks,
        access: storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/locks:GET",
      requestId,
      error,
      message: "Failed to list edit locks",
    });
  }
}

export async function PUT(
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
      requiredPermission: "edit",
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

    const parsedBody = acquireLockRequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const { resource, ttlSeconds, reason } = parsedBody.data;
    const lockResult = await acquireStoryEditLock({
      storyId: storyAccess.story.id,
      resource,
      userId,
      ttlSeconds: ttlSeconds ?? 90,
      reason: reason ?? null,
    });

    if (!lockResult.acquired) {
      const resolution = await buildCoEditConflictResolution({
        storyId: storyAccess.story.id,
        lockedByUserId: lockResult.conflict.userId,
        requestingUserId: userId,
        expiresAt: lockResult.conflict.expiresAt,
      });
      return apiError({
        status: 409,
        error: "Resource currently locked by another collaborator",
        details: {
          resource,
          lockedByUserId: lockResult.conflict.userId,
          lockedByUserLabel: formatPresenceUserLabel(lockResult.conflict.userId),
          expiresAt: lockResult.conflict.expiresAt,
          resolution,
        },
        requestId,
      });
    }

    await pruneExpiredStoryEditLocks({ storyId: storyAccess.story.id });
    const locks = await listActiveStoryEditLocks({
      storyId: storyAccess.story.id,
    });
    const mappedLocks = await mapLockRows(locks, storyAccess.story.id, userId);

    return apiJson(
      {
        lock: {
          id: lockResult.lock.id,
          resource: lockResult.lock.resource,
          userId: lockResult.lock.userId,
          userLabel: formatPresenceUserLabel(lockResult.lock.userId),
          reason: lockResult.lock.reason,
          expiresAt: lockResult.lock.expiresAt,
          isCurrentUser: true,
        },
        locks: mappedLocks,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/locks:PUT",
      requestId,
      error,
      message: "Failed to acquire edit lock",
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
      requiredPermission: "edit",
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

    const parsedBody = releaseLockRequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const released = await releaseStoryEditLock({
      storyId: storyAccess.story.id,
      resource: parsedBody.data.resource,
      userId,
    });

    if (!released) {
      return apiError({
        status: 404,
        error: "Lock not found",
        requestId,
      });
    }

    await pruneExpiredStoryEditLocks({ storyId: storyAccess.story.id });
    const locks = await listActiveStoryEditLocks({
      storyId: storyAccess.story.id,
    });
    const mappedLocks = await mapLockRows(locks, storyAccess.story.id, userId);

    return apiJson(
      {
        success: true,
        locks: mappedLocks,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/locks:DELETE",
      requestId,
      error,
      message: "Failed to release edit lock",
    });
  }
}
