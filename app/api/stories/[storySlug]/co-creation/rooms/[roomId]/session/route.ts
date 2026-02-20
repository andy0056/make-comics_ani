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
  getStoryCoCreationRoom,
  leaveStoryCoCreationRoomSession,
  listActiveStoryCoCreationRoomSessions,
  pruneIdleStoryCoCreationRoomSessions,
  upsertStoryCoCreationRoomSession,
} from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { formatPresenceUserLabel } from "@/lib/story-coedit";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const heartbeatRequestSchema = z.object({
  activePanel: z.string().trim().max(48).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function mapSessions(
  sessions: Awaited<ReturnType<typeof listActiveStoryCoCreationRoomSessions>>,
  currentUserId: string,
) {
  return sessions.map((session) => ({
    id: session.id,
    roomId: session.roomId,
    userId: session.userId,
    userLabel: formatPresenceUserLabel(session.userId),
    activePanel: session.activePanel,
    status: session.status,
    lastSeenAt: session.lastSeenAt,
    isCurrentUser: session.userId === currentUserId,
  }));
}

async function getRoomSessionSnapshot({
  storyId,
  roomId,
  userId,
}: {
  storyId: string;
  roomId: string;
  userId: string;
}) {
  await pruneIdleStoryCoCreationRoomSessions({
    storyId,
    maxIdleSeconds: 200,
  });

  const sessions = await listActiveStoryCoCreationRoomSessions({
    storyId,
    roomId,
    withinSeconds: 170,
  });
  return {
    participants: mapSessions(sessions, userId),
    participantCount: sessions.length,
    serverTime: new Date().toISOString(),
  };
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
    if (!room || room.isArchived) {
      return apiError({
        status: 404,
        error: "Room not found",
        requestId,
      });
    }

    const snapshot = await getRoomSessionSnapshot({
      storyId: storyAccess.story.id,
      roomId,
      userId,
    });

    return apiJson(
      {
        room,
        ...snapshot,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/co-creation/rooms/[roomId]/session:GET",
      requestId,
      error,
      message: "Failed to load room session snapshot",
    });
  }
}

export async function POST(
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

    const room = await getStoryCoCreationRoom({
      storyId: storyAccess.story.id,
      roomId,
    });
    if (!room || room.isArchived) {
      return apiError({
        status: 404,
        error: "Room not found",
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

    await upsertStoryCoCreationRoomSession({
      storyId: storyAccess.story.id,
      roomId: room.id,
      userId,
      activePanel: parsedBody.data.activePanel ?? "universe",
      metadata: parsedBody.data.metadata,
    });

    const snapshot = await getRoomSessionSnapshot({
      storyId: storyAccess.story.id,
      roomId,
      userId,
    });
    return apiJson(
      {
        room,
        ...snapshot,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/co-creation/rooms/[roomId]/session:POST",
      requestId,
      error,
      message: "Failed to join room session",
    });
  }
}

export async function DELETE(
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

    const room = await getStoryCoCreationRoom({
      storyId: storyAccess.story.id,
      roomId,
    });
    if (!room || room.isArchived) {
      return apiError({
        status: 404,
        error: "Room not found",
        requestId,
      });
    }

    await leaveStoryCoCreationRoomSession({
      storyId: storyAccess.story.id,
      roomId: room.id,
      userId,
    });

    const snapshot = await getRoomSessionSnapshot({
      storyId: storyAccess.story.id,
      roomId,
      userId,
    });
    return apiJson(
      {
        room,
        ...snapshot,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName:
        "api/stories/[storySlug]/co-creation/rooms/[roomId]/session:DELETE",
      requestId,
      error,
      message: "Failed to leave room session",
    });
  }
}
