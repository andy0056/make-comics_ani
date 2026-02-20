import { formatPresenceUserLabel } from "@/lib/story-coedit";

export const CO_CREATION_ROOM_MODES = [
  "writers_room",
  "director_room",
  "continuity_room",
] as const;

export type CoCreationRoomMode = (typeof CO_CREATION_ROOM_MODES)[number];

export type CoCreationRoomSnapshot = {
  id: string;
  storyId: string;
  name: string;
  mode: CoCreationRoomMode | string;
  objective: string | null;
  createdByUserId: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  activeParticipants: Array<{
    userId: string;
    userLabel: string;
    activePanel: string | null;
    lastSeenAt: string;
    isCurrentUser: boolean;
  }>;
  activeParticipantCount: number;
};

export function formatCoCreationRoomMode(mode: string): string {
  if (mode === "writers_room") return "Writers Room";
  if (mode === "director_room") return "Director Room";
  if (mode === "continuity_room") return "Continuity Room";
  return mode
    .split("_")
    .map((part) => (part.length > 0 ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

export function buildCoCreationRoomSnapshots({
  rooms,
  sessions,
  currentUserId,
}: {
  rooms: Array<{
    id: string;
    storyId: string;
    name: string;
    mode: string;
    objective: string | null;
    createdByUserId: string;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  sessions: Array<{
    id: string;
    storyId: string;
    roomId: string;
    userId: string;
    activePanel: string | null;
    lastSeenAt: Date;
  }>;
  currentUserId: string;
}): CoCreationRoomSnapshot[] {
  const sessionsByRoomId = new Map<
    string,
    Array<{
      id: string;
      storyId: string;
      roomId: string;
      userId: string;
      activePanel: string | null;
      lastSeenAt: Date;
    }>
  >();

  sessions.forEach((session) => {
    const group = sessionsByRoomId.get(session.roomId) ?? [];
    group.push(session);
    sessionsByRoomId.set(session.roomId, group);
  });

  return rooms.map((room) => {
    const roomSessions = (sessionsByRoomId.get(room.id) ?? []).sort(
      (left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime(),
    );

    const activeParticipants = roomSessions.map((session) => ({
      userId: session.userId,
      userLabel: formatPresenceUserLabel(session.userId),
      activePanel: session.activePanel,
      lastSeenAt: session.lastSeenAt.toISOString(),
      isCurrentUser: session.userId === currentUserId,
    }));

    return {
      id: room.id,
      storyId: room.storyId,
      name: room.name,
      mode: room.mode,
      objective: room.objective,
      createdByUserId: room.createdByUserId,
      isArchived: room.isArchived,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      activeParticipants,
      activeParticipantCount: activeParticipants.length,
    };
  });
}
