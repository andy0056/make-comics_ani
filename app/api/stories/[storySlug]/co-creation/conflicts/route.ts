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
  createStoryCoCreationAuditEvent,
  getActiveStoryEditLockByResource,
  getStoryCollaborator,
  handoffStoryEditLock,
  listActiveStoryEditLocks,
  pruneExpiredStoryEditLocks,
} from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { formatPresenceUserLabel, STORY_EDIT_RESOURCE } from "@/lib/story-coedit";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const lockResourceSchema = z.enum([
  STORY_EDIT_RESOURCE.title,
  STORY_EDIT_RESOURCE.pages,
  STORY_EDIT_RESOURCE.characterBible,
]);

const querySchema = z.object({
  resource: lockResourceSchema.optional(),
});

const mutateSchema = z.object({
  action: z.enum(["request_release", "handoff_lock"]),
  resource: lockResourceSchema,
  targetUserId: z.string().trim().min(1).optional(),
  note: z.string().trim().max(240).optional(),
});

async function buildConflicts({
  storyId,
  userId,
  resource,
}: {
  storyId: string;
  userId: string;
  resource?: z.infer<typeof lockResourceSchema>;
}) {
  await pruneExpiredStoryEditLocks({
    storyId,
  });
  const allLocks = await listActiveStoryEditLocks({
    storyId,
  });
  const locks = allLocks.filter((lock) => {
    if (lock.userId === userId) {
      return false;
    }
    if (resource) {
      return lock.resource === resource;
    }
    return true;
  });

  return Promise.all(
    locks.map(async (lock) => {
      const resolution = await buildCoEditConflictResolution({
        storyId,
        lockedByUserId: lock.userId,
        requestingUserId: userId,
        expiresAt: lock.expiresAt,
      });
      return {
        lockId: lock.id,
        resource: lock.resource,
        lockedByUserId: lock.userId,
        lockedByUserLabel: formatPresenceUserLabel(lock.userId),
        reason: lock.reason,
        expiresAt: lock.expiresAt,
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

    const parsedQuery = querySchema.safeParse({
      resource: request.nextUrl.searchParams.get("resource") ?? undefined,
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

    const conflicts = await buildConflicts({
      storyId: storyAccess.story.id,
      userId,
      resource: parsedQuery.data.resource,
    });

    return apiJson(
      {
        conflicts,
        access: storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/co-creation/conflicts:GET",
      requestId,
      error,
      message: "Failed to load co-edit conflicts",
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

    const parsed = mutateSchema.safeParse(requestBody);
    if (!parsed.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsed.error.flatten(),
        requestId,
      });
    }

    await pruneExpiredStoryEditLocks({
      storyId: storyAccess.story.id,
    });
    const activeLock = await getActiveStoryEditLockByResource({
      storyId: storyAccess.story.id,
      resource: parsed.data.resource,
    });
    if (!activeLock) {
      return apiError({
        status: 404,
        error: "No active lock for this resource",
        requestId,
      });
    }

    if (parsed.data.action === "request_release") {
      if (activeLock.userId === userId) {
        return apiError({
          status: 400,
          error: "You already hold this lock",
          requestId,
        });
      }

      await createStoryCoCreationAuditEvent({
        storyId: storyAccess.story.id,
        actorUserId: userId,
        eventType: "lock_release_requested",
        resource: parsed.data.resource,
        targetUserId: activeLock.userId,
        details: {
          note: parsed.data.note ?? "",
          expiresAt: activeLock.expiresAt.toISOString(),
        },
      });

      const conflicts = await buildConflicts({
        storyId: storyAccess.story.id,
        userId,
        resource: parsed.data.resource,
      });
      return apiJson(
        {
          success: true,
          message: `Release request logged for ${formatPresenceUserLabel(activeLock.userId)}.`,
          conflicts,
        },
        { requestId },
      );
    }

    const targetUserId = parsed.data.targetUserId?.trim();
    if (!targetUserId) {
      return apiError({
        status: 400,
        error: "targetUserId is required for handoff",
        requestId,
      });
    }
    if (targetUserId === activeLock.userId) {
      return apiError({
        status: 400,
        error: "targetUserId already owns this lock",
        requestId,
      });
    }

    const canForceHandoff = storyAccess.access.canManage;
    if (!canForceHandoff && activeLock.userId !== userId) {
      return apiError({
        status: 403,
        error: "Only the lock owner can hand off this lock",
        requestId,
      });
    }

    const targetCanEdit =
      targetUserId === storyAccess.story.userId ||
      (await getStoryCollaborator({
        storyId: storyAccess.story.id,
        userId: targetUserId,
      }))?.role === "editor";
    if (!targetCanEdit) {
      return apiError({
        status: 400,
        error: "targetUserId must be an editor on this story",
        requestId,
      });
    }

    const handedOff = await handoffStoryEditLock({
      storyId: storyAccess.story.id,
      resource: parsed.data.resource,
      fromUserId: activeLock.userId,
      toUserId: targetUserId,
      reason: parsed.data.note ?? `handoff:${parsed.data.resource}`,
      ttlSeconds: 120,
    });
    if (!handedOff) {
      return apiError({
        status: 409,
        error: "Lock handoff failed due to a concurrent lock change",
        requestId,
      });
    }

    await createStoryCoCreationAuditEvent({
      storyId: storyAccess.story.id,
      actorUserId: userId,
      eventType: "lock_handoff",
      resource: parsed.data.resource,
      targetUserId,
      details: {
        fromUserId: activeLock.userId,
        note: parsed.data.note ?? "",
      },
    });

    const conflicts = await buildConflicts({
      storyId: storyAccess.story.id,
      userId,
      resource: parsed.data.resource,
    });
    return apiJson(
      {
        success: true,
        message: `Lock handed off to ${formatPresenceUserLabel(targetUserId)}.`,
        conflicts,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/co-creation/conflicts:POST",
      requestId,
      error,
      message: "Failed to resolve co-edit conflict",
    });
  }
}
