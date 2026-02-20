import { describe, expect, it } from "vitest";
import {
  buildCoCreationRoomSnapshots,
  formatCoCreationRoomMode,
} from "@/lib/co-creation-room";

describe("co-creation-room", () => {
  it("formats room modes into readable labels", () => {
    expect(formatCoCreationRoomMode("writers_room")).toBe("Writers Room");
    expect(formatCoCreationRoomMode("custom_mode")).toBe("Custom Mode");
  });

  it("builds room snapshots with participant counts and labels", () => {
    const now = new Date("2026-02-15T01:10:00.000Z");
    const snapshots = buildCoCreationRoomSnapshots({
      rooms: [
        {
          id: "room-1",
          storyId: "story-1",
          name: "Main Room",
          mode: "writers_room",
          objective: "Draft next branch.",
          createdByUserId: "owner_user",
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
      sessions: [
        {
          id: "session-1",
          storyId: "story-1",
          roomId: "room-1",
          userId: "user_alpha",
          activePanel: "universe",
          lastSeenAt: new Date("2026-02-15T01:09:50.000Z"),
        },
        {
          id: "session-2",
          storyId: "story-1",
          roomId: "room-1",
          userId: "user_beta",
          activePanel: "generate",
          lastSeenAt: new Date("2026-02-15T01:09:20.000Z"),
        },
      ],
      currentUserId: "user_alpha",
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.activeParticipantCount).toBe(2);
    expect(snapshots[0]?.activeParticipants[0]?.isCurrentUser).toBe(true);
    expect(snapshots[0]?.activeParticipants[0]?.userLabel).toContain("user_");
  });
});
