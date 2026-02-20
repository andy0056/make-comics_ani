import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db-actions", () => ({
  getStoriesWithPageStatsForUser: vi.fn(),
  getMissionStatesForUser: vi.fn(),
  upsertMissionState: vi.fn(),
  updateMissionStateStatus: vi.fn(),
}));

import {
  getMissionStatesForUser,
  getStoriesWithPageStatsForUser,
  upsertMissionState,
  updateMissionStateStatus,
} from "@/lib/db-actions";
import {
  COMPLETE_ARC_MISSION_TYPE,
  EXPAND_UNIVERSE_MISSION_TYPE,
  RESUME_MISSION_TYPE,
  REVIVE_DORMANT_MISSION_TYPE,
  syncAndGetRetentionMissionsForUser,
} from "@/lib/retention-missions";
import { type MissionState } from "@/lib/schema";

const mockedGetStoriesWithPageStatsForUser = vi.mocked(getStoriesWithPageStatsForUser);
const mockedGetMissionStatesForUser = vi.mocked(getMissionStatesForUser);
const mockedUpsertMissionState = vi.mocked(upsertMissionState);
const mockedUpdateMissionStateStatus = vi.mocked(updateMissionStateStatus);

function createStoryStats(overrides: Partial<{
  id: string;
  slug: string;
  title: string;
  pageCount: number;
  pendingPageCount: number;
  updatedAt: Date;
}> = {}) {
  return {
    id: "story-1",
    slug: "story-1",
    title: "Story One",
    pageCount: 1,
    pendingPageCount: 0,
    updatedAt: new Date("2026-02-15T00:00:00.000Z"),
    ...overrides,
  };
}

function createMissionState(
  overrides: Partial<MissionState> & {
    missionType: string;
    storyId: string;
  },
): MissionState {
  return {
    id: "mission-1",
    userId: "user-1",
    storyId: overrides.storyId,
    missionType: overrides.missionType,
    status: "open",
    lastPromptedAt: new Date("2026-02-15T00:00:00.000Z"),
    metadata: {},
    createdAt: new Date("2026-02-15T00:00:00.000Z"),
    updatedAt: new Date("2026-02-15T00:00:00.000Z"),
    ...overrides,
  };
}

describe("retention-missions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates prioritized open missions for pending and early-arc stories", async () => {
    const pendingStory = createStoryStats({
      id: "story-pending",
      slug: "story-pending",
      title: "Pending Story",
      pageCount: 2,
      pendingPageCount: 1,
      updatedAt: new Date("2026-02-15T08:00:00.000Z"),
    });
    const arcStory = createStoryStats({
      id: "story-arc",
      slug: "story-arc",
      title: "Arc Story",
      pageCount: 2,
      pendingPageCount: 0,
      updatedAt: new Date("2026-02-15T09:00:00.000Z"),
    });

    mockedGetStoriesWithPageStatsForUser.mockResolvedValue([pendingStory, arcStory]);
    mockedGetMissionStatesForUser
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        createMissionState({
          id: "mission-pending",
          storyId: pendingStory.id,
          missionType: RESUME_MISSION_TYPE,
          metadata: { pendingPageCount: 1, pageCount: 2 },
          updatedAt: new Date("2026-02-15T12:00:00.000Z"),
        }),
        createMissionState({
          id: "mission-arc",
          storyId: arcStory.id,
          missionType: COMPLETE_ARC_MISSION_TYPE,
          metadata: { pagesRemaining: 2, pageCount: 2 },
          updatedAt: new Date("2026-02-15T12:00:00.000Z"),
        }),
      ]);

    mockedUpsertMissionState
      .mockResolvedValueOnce(
        createMissionState({
          id: "mission-pending",
          storyId: pendingStory.id,
          missionType: RESUME_MISSION_TYPE,
          metadata: { pendingPageCount: 1, pageCount: 2 },
        }),
      )
      .mockResolvedValueOnce(
        createMissionState({
          id: "mission-arc",
          storyId: arcStory.id,
          missionType: COMPLETE_ARC_MISSION_TYPE,
          metadata: { pagesRemaining: 2, pageCount: 2 },
        }),
      );
    mockedUpdateMissionStateStatus.mockResolvedValue(null);

    const result = await syncAndGetRetentionMissionsForUser("user-1");

    expect(result).toHaveLength(2);
    expect(result.map((mission) => mission.missionType)).toEqual([
      RESUME_MISSION_TYPE,
      COMPLETE_ARC_MISSION_TYPE,
    ]);
    expect(result[0].summary).toContain("recover 1 pending page");
    expect(result[1].summary).toContain("opening arc");
  });

  it("assigns dormant and expansion missions based on inactivity windows", async () => {
    const dormantUnfinished = createStoryStats({
      id: "story-dormant",
      slug: "story-dormant",
      title: "Dormant Story",
      pageCount: 2,
      pendingPageCount: 0,
      updatedAt: new Date("2026-02-05T00:00:00.000Z"),
    });
    const dormantExpanded = createStoryStats({
      id: "story-expanded",
      slug: "story-expanded",
      title: "Universe Story",
      pageCount: 6,
      pendingPageCount: 0,
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    mockedGetStoriesWithPageStatsForUser.mockResolvedValue([
      dormantUnfinished,
      dormantExpanded,
    ]);
    mockedGetMissionStatesForUser
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        createMissionState({
          id: "mission-revive",
          storyId: dormantUnfinished.id,
          missionType: REVIVE_DORMANT_MISSION_TYPE,
          metadata: { dormantDays: 10 },
          updatedAt: new Date("2026-02-15T12:00:00.000Z"),
        }),
        createMissionState({
          id: "mission-expand",
          storyId: dormantExpanded.id,
          missionType: EXPAND_UNIVERSE_MISSION_TYPE,
          metadata: { dormantDays: 14 },
          updatedAt: new Date("2026-02-15T12:00:00.000Z"),
        }),
      ]);
    mockedUpsertMissionState
      .mockResolvedValueOnce(
        createMissionState({
          id: "mission-revive",
          storyId: dormantUnfinished.id,
          missionType: REVIVE_DORMANT_MISSION_TYPE,
          metadata: { dormantDays: 10 },
        }),
      )
      .mockResolvedValueOnce(
        createMissionState({
          id: "mission-expand",
          storyId: dormantExpanded.id,
          missionType: EXPAND_UNIVERSE_MISSION_TYPE,
          metadata: { dormantDays: 14 },
        }),
      );
    mockedUpdateMissionStateStatus.mockResolvedValue(null);

    const result = await syncAndGetRetentionMissionsForUser("user-1");

    expect(result.map((mission) => mission.missionType)).toEqual([
      REVIVE_DORMANT_MISSION_TYPE,
      EXPAND_UNIVERSE_MISSION_TYPE,
    ]);
    expect(result[0].summary).toContain("dormant day");
    expect(result[1].summary).toContain("Re-ignite");
  });

  it("dismisses obsolete open missions when a story no longer needs one", async () => {
    const stableStory = createStoryStats({
      id: "story-stable",
      slug: "story-stable",
      title: "Stable Story",
      pageCount: 5,
      pendingPageCount: 0,
      updatedAt: new Date("2026-02-15T11:30:00.000Z"),
    });
    const staleMission = createMissionState({
      id: "mission-stale",
      storyId: stableStory.id,
      missionType: RESUME_MISSION_TYPE,
      status: "open",
    });

    mockedGetStoriesWithPageStatsForUser.mockResolvedValue([stableStory]);
    mockedGetMissionStatesForUser
      .mockResolvedValueOnce([staleMission])
      .mockResolvedValueOnce([
        {
          ...staleMission,
          status: "dismissed",
        },
      ]);
    mockedUpsertMissionState.mockResolvedValue(staleMission);
    mockedUpdateMissionStateStatus.mockResolvedValue({
      ...staleMission,
      status: "dismissed",
      updatedAt: new Date("2026-02-15T12:00:00.000Z"),
    });

    const result = await syncAndGetRetentionMissionsForUser("user-1");

    expect(mockedUpdateMissionStateStatus).toHaveBeenCalledWith({
      missionId: staleMission.id,
      userId: "user-1",
      status: "dismissed",
    });
    expect(mockedUpsertMissionState).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
