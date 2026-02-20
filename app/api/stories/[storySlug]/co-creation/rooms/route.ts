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
  createStoryCoCreationAuditEvent,
  createStoryCoCreationRoom,
  listActiveStoryCoCreationRoomSessions,
  listStoryCoCreationRooms,
  pruneIdleStoryCoCreationRoomSessions,
  upsertStoryCoCreationRoomSession,
} from "@/lib/db-actions";
import {
  buildCoCreationRoomSnapshots,
  CO_CREATION_ROOM_MODES,
} from "@/lib/co-creation-room";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const roomModeSchema = z.enum(CO_CREATION_ROOM_MODES);

const createRoomRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  mode: roomModeSchema.default("writers_room"),
  objective: z.string().trim().max(320).optional().nullable(),
  autoJoin: z.boolean().optional(),
});

const querySchema = z.object({
  includeArchived: z
    .enum(["1", "true", "yes", "on"])
    .optional(),
});

async function getRoomSnapshot({
  storyId,
  userId,
  includeArchived = false,
}: {
  storyId: string;
  userId: string;
  includeArchived?: boolean;
}) {
  await pruneIdleStoryCoCreationRoomSessions({
    storyId,
    maxIdleSeconds: 200,
  });

  const [rooms, sessions] = await Promise.all([
    listStoryCoCreationRooms({ storyId, includeArchived }),
    listActiveStoryCoCreationRoomSessions({
      storyId,
      withinSeconds: 170,
    }),
  ]);

  return buildCoCreationRoomSnapshots({
    rooms,
    sessions,
    currentUserId: userId,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
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

    const { storySlug } = await params;
    if (!storySlug) {
      return apiError({
        status: 400,
        error: "Story slug is required",
        requestId,
      });
    }

    const parsedQuery = querySchema.safeParse({
      includeArchived:
        request.nextUrl.searchParams.get("includeArchived") ?? undefined,
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

    const includeArchived =
      parsedQuery.data.includeArchived !== undefined && storyAccess.access.canManage;

    const rooms = await getRoomSnapshot({
      storyId: storyAccess.story.id,
      userId,
      includeArchived,
    });
    return apiJson(
      {
        rooms,
        access: storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/co-creation/rooms:GET",
      requestId,
      error,
      message: "Failed to load co-creation rooms",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
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

    const parsedBody = createRoomRequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const createdRoom = await createStoryCoCreationRoom({
      storyId: storyAccess.story.id,
      name: parsedBody.data.name,
      mode: parsedBody.data.mode,
      objective: parsedBody.data.objective ?? null,
      createdByUserId: userId,
    });

    if (parsedBody.data.autoJoin !== false) {
      await upsertStoryCoCreationRoomSession({
        storyId: storyAccess.story.id,
        roomId: createdRoom.id,
        userId,
        activePanel: "universe",
      });
    }

    await createStoryCoCreationAuditEvent({
      storyId: storyAccess.story.id,
      roomId: createdRoom.id,
      actorUserId: userId,
      eventType: "room_created",
      details: {
        mode: createdRoom.mode,
        objective: createdRoom.objective ?? "",
      },
    });

    const rooms = await getRoomSnapshot({
      storyId: storyAccess.story.id,
      userId,
    });
    return apiJson(
      {
        room: createdRoom,
        rooms,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/co-creation/rooms:POST",
      requestId,
      error,
      message: "Failed to create co-creation room",
    });
  }
}
