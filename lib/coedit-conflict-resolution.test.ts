import { describe, expect, it } from "vitest";
import { buildCoEditConflictResolutionFromSnapshots } from "@/lib/coedit-conflict-resolution";

describe("coedit-conflict-resolution", () => {
  it("prefers shared-room coordination when both users are active together", () => {
    const resolution = buildCoEditConflictResolutionFromSnapshots({
      rooms: [
        {
          id: "room-shared",
          name: "Main Writers Room",
          mode: "writers_room",
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
      ],
      sessions: [
        { roomId: "room-shared", userId: "locker_user" },
        { roomId: "room-shared", userId: "request_user" },
      ],
      lockedByUserId: "locker_user",
      requestingUserId: "request_user",
      expiresAt: new Date("2026-02-15T00:00:30.000Z"),
      now: new Date("2026-02-15T00:00:00.000Z"),
    });

    expect(resolution.roomContexts[0]?.sharedSession).toBe(true);
    expect(resolution.suggestedActions[0]?.code).toBe("coordinate_in_shared_room");
  });

  it("suggests joining locker room when users are in different rooms", () => {
    const resolution = buildCoEditConflictResolutionFromSnapshots({
      rooms: [
        {
          id: "room-locker",
          name: "Director Room",
          mode: "director_room",
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
        {
          id: "room-requester",
          name: "Continuity Room",
          mode: "continuity_room",
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
      ],
      sessions: [
        { roomId: "room-locker", userId: "locker_user" },
        { roomId: "room-requester", userId: "request_user" },
      ],
      lockedByUserId: "locker_user",
      requestingUserId: "request_user",
      expiresAt: new Date("2026-02-15T00:01:10.000Z"),
      now: new Date("2026-02-15T00:00:00.000Z"),
    });

    expect(
      resolution.suggestedActions.some((action) => action.code === "join_locker_room"),
    ).toBe(true);
    expect(resolution.retryAfterSeconds).toBeGreaterThan(0);
  });
});
