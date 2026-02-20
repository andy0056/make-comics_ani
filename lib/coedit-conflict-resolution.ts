import { formatCoCreationRoomMode } from "@/lib/co-creation-room";
import { isFeatureEnabled } from "@/lib/feature-flags";

type RoomLike = {
  id: string;
  name: string;
  mode: string;
  updatedAt: Date;
};

type SessionLike = {
  roomId: string;
  userId: string;
};

export type CoEditConflictRoomContext = {
  roomId: string;
  roomName: string;
  roomMode: string;
  lockerActive: boolean;
  requesterActive: boolean;
  sharedSession: boolean;
};

export type CoEditConflictSuggestion = {
  code:
    | "wait_and_retry"
    | "coordinate_in_shared_room"
    | "join_locker_room"
    | "switch_to_locker_room"
    | "refresh_live_state";
  label: string;
  description: string;
};

export type CoEditConflictResolution = {
  summary: string;
  retryAfterSeconds: number;
  roomContexts: CoEditConflictRoomContext[];
  suggestedActions: CoEditConflictSuggestion[];
};

function rankRoomContext(context: CoEditConflictRoomContext): number {
  if (context.sharedSession) return 4;
  if (context.lockerActive) return 3;
  if (context.requesterActive) return 2;
  return 1;
}

export function buildCoEditConflictResolutionFromSnapshots({
  rooms,
  sessions,
  lockedByUserId,
  requestingUserId,
  expiresAt,
  now = new Date(),
}: {
  rooms: RoomLike[];
  sessions: SessionLike[];
  lockedByUserId: string;
  requestingUserId: string;
  expiresAt: Date;
  now?: Date;
}): CoEditConflictResolution {
  const sessionsByRoomId = new Map<string, Set<string>>();
  sessions.forEach((session) => {
    const roomUsers = sessionsByRoomId.get(session.roomId) ?? new Set<string>();
    roomUsers.add(session.userId);
    sessionsByRoomId.set(session.roomId, roomUsers);
  });

  const roomContexts = rooms
    .map((room) => {
      const roomUsers = sessionsByRoomId.get(room.id) ?? new Set<string>();
      const lockerActive = roomUsers.has(lockedByUserId);
      const requesterActive = roomUsers.has(requestingUserId);
      if (!lockerActive && !requesterActive) {
        return null;
      }

      return {
        roomId: room.id,
        roomName: room.name,
        roomMode: formatCoCreationRoomMode(room.mode),
        lockerActive,
        requesterActive,
        sharedSession: lockerActive && requesterActive,
      };
    })
    .filter((context): context is CoEditConflictRoomContext => Boolean(context))
    .sort((left, right) => {
      const leftRank = rankRoomContext(left);
      const rightRank = rankRoomContext(right);
      if (leftRank !== rightRank) {
        return rightRank - leftRank;
      }
      return left.roomName.localeCompare(right.roomName);
    });

  const retryAfterSeconds = Math.max(
    3,
    Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
  );

  const suggestedActions: CoEditConflictSuggestion[] = [
    {
      code: "wait_and_retry",
      label: "Retry after lock expiry",
      description: `Retry in about ${retryAfterSeconds}s when the lock auto-expires.`,
    },
  ];

  const sharedRoom = roomContexts.find((context) => context.sharedSession);
  if (sharedRoom) {
    suggestedActions.unshift({
      code: "coordinate_in_shared_room",
      label: "Coordinate in shared room",
      description: `Both collaborators are active in "${sharedRoom.roomName}". Coordinate a quick handoff there.`,
    });
  } else {
    const lockerRoom = roomContexts.find((context) => context.lockerActive);
    if (lockerRoom) {
      suggestedActions.unshift({
        code: "join_locker_room",
        label: "Join locker room",
        description: `${lockedByUserId} is active in "${lockerRoom.roomName}". Join to request a handoff.`,
      });
    }

    const requesterOnlyRoom = roomContexts.find(
      (context) => context.requesterActive && !context.lockerActive,
    );
    if (requesterOnlyRoom && lockerRoom) {
      suggestedActions.push({
        code: "switch_to_locker_room",
        label: "Switch rooms",
        description: `Move from "${requesterOnlyRoom.roomName}" to "${lockerRoom.roomName}" for faster resolution.`,
      });
    }
  }

  suggestedActions.push({
    code: "refresh_live_state",
    label: "Refresh live state",
    description:
      "Refresh room presence and lock state before retrying to avoid stale conflicts.",
  });

  const summary =
    suggestedActions[0]?.description ??
    `Resource locked. Retry in about ${retryAfterSeconds}s.`;

  return {
    summary,
    retryAfterSeconds,
    roomContexts,
    suggestedActions,
  };
}

export async function buildCoEditConflictResolution({
  storyId,
  lockedByUserId,
  requestingUserId,
  expiresAt,
}: {
  storyId: string;
  lockedByUserId: string;
  requestingUserId: string;
  expiresAt: Date;
}): Promise<CoEditConflictResolution> {
  if (!isFeatureEnabled("co_creation_rooms")) {
    return buildCoEditConflictResolutionFromSnapshots({
      rooms: [],
      sessions: [],
      lockedByUserId,
      requestingUserId,
      expiresAt,
    });
  }

  const {
    listStoryCoCreationRooms,
    listActiveStoryCoCreationRoomSessions,
  } = await import("@/lib/db-actions");

  const [rooms, sessions] = await Promise.all([
    listStoryCoCreationRooms({
      storyId,
    }),
    listActiveStoryCoCreationRoomSessions({
      storyId,
      withinSeconds: 180,
    }),
  ]);

  return buildCoEditConflictResolutionFromSnapshots({
    rooms,
    sessions,
    lockedByUserId,
    requestingUserId,
    expiresAt,
  });
}
