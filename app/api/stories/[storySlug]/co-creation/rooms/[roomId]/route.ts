import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import {
  archiveStoryCoCreationRoom,
  createStoryCoCreationAuditEvent,
  getStoryCoCreationRoom,
  getStoryCollaborator,
  transferStoryCoCreationRoomOwner,
} from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const updateRoomSchema = z
  .object({
    action: z.enum(["archive", "transfer_owner"]),
    targetUserId: z.string().trim().min(1).optional(),
    note: z.string().trim().max(240).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "transfer_owner" && !value.targetUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetUserId"],
        message: "targetUserId is required for transfer_owner",
      });
    }
  });

function canManageRoom({
  userId,
  roomOwnerUserId,
  canManageStory,
}: {
  userId: string;
  roomOwnerUserId: string;
  canManageStory: boolean;
}): boolean {
  return canManageStory || roomOwnerUserId === userId;
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ storySlug: string; roomId: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isFeatureEnabled("co_creation_rooms")) {
      return apiError({
        status: 404,
        error: "Co-creation rooms feature is disabled",
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

    const { storySlug, roomId } = await params;
    if (!storySlug || !roomId) {
      return apiError({
        status: 400,
        error: "Story slug and room ID are required",
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

    const room = await getStoryCoCreationRoom({
      storyId: storyAccess.story.id,
      roomId,
    });
    if (!room) {
      return apiError({
        status: 404,
        error: "Room not found",
        requestId,
      });
    }

    return apiJson(
      {
        room,
        access: {
          canManageRoom: canManageRoom({
            userId,
            roomOwnerUserId: room.createdByUserId,
            canManageStory: storyAccess.access.canManage,
          }),
          canManageStory: storyAccess.access.canManage,
          role: storyAccess.access.role,
        },
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/co-creation/rooms/[roomId]:GET",
      requestId,
      error,
      message: "Failed to load co-creation room",
    });
  }
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ storySlug: string; roomId: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isFeatureEnabled("co_creation_rooms")) {
      return apiError({
        status: 404,
        error: "Co-creation rooms feature is disabled",
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

    const { storySlug, roomId } = await params;
    if (!storySlug || !roomId) {
      return apiError({
        status: 400,
        error: "Story slug and room ID are required",
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

    const parsed = updateRoomSchema.safeParse(requestBody);
    if (!parsed.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsed.error.flatten(),
        requestId,
      });
    }

    const room = await getStoryCoCreationRoom({
      storyId: storyAccess.story.id,
      roomId,
    });
    if (!room) {
      return apiError({
        status: 404,
        error: "Room not found",
        requestId,
      });
    }

    const canManage = canManageRoom({
      userId,
      roomOwnerUserId: room.createdByUserId,
      canManageStory: storyAccess.access.canManage,
    });
    if (!canManage) {
      return apiError({
        status: 403,
        error: "You do not have permission to manage this room",
        requestId,
      });
    }

    if (parsed.data.action === "archive") {
      if (!room.isArchived) {
        await archiveStoryCoCreationRoom({
          storyId: storyAccess.story.id,
          roomId: room.id,
        });
        await createStoryCoCreationAuditEvent({
          storyId: storyAccess.story.id,
          roomId: room.id,
          actorUserId: userId,
          eventType: "room_archived",
          details: {
            note: parsed.data.note ?? "",
            previousOwnerUserId: room.createdByUserId,
          },
        });
      }

      const updatedRoom = await getStoryCoCreationRoom({
        storyId: storyAccess.story.id,
        roomId: room.id,
      });
      return apiJson(
        {
          success: true,
          room: updatedRoom ?? room,
          message: "Room archived",
        },
        { requestId },
      );
    }

    const targetUserId = parsed.data.targetUserId?.trim();
    if (!targetUserId) {
      return apiError({
        status: 400,
        error: "targetUserId is required",
        requestId,
      });
    }
    if (targetUserId === room.createdByUserId) {
      return apiError({
        status: 400,
        error: "targetUserId already owns this room",
        requestId,
      });
    }

    const targetCanOwnRoom =
      targetUserId === storyAccess.story.userId ||
      (await getStoryCollaborator({
        storyId: storyAccess.story.id,
        userId: targetUserId,
      }))?.role === "editor";
    if (!targetCanOwnRoom) {
      return apiError({
        status: 400,
        error: "targetUserId must be the owner or an editor collaborator",
        requestId,
      });
    }

    const updatedRoom = await transferStoryCoCreationRoomOwner({
      storyId: storyAccess.story.id,
      roomId: room.id,
      newOwnerUserId: targetUserId,
    });
    if (!updatedRoom) {
      return apiError({
        status: 409,
        error: "Room transfer failed due to concurrent update",
        requestId,
      });
    }

    await createStoryCoCreationAuditEvent({
      storyId: storyAccess.story.id,
      roomId: room.id,
      actorUserId: userId,
      eventType: "room_owner_transferred",
      targetUserId,
      details: {
        previousOwnerUserId: room.createdByUserId,
        note: parsed.data.note ?? "",
      },
    });

    return apiJson(
      {
        success: true,
        room: updatedRoom,
        message: "Room ownership transferred",
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/co-creation/rooms/[roomId]:PATCH",
      requestId,
      error,
      message: "Failed to update co-creation room",
    });
  }
}
