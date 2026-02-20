import {
  getMissionStatesForUser,
  getStoriesWithPageStatsForUser,
  upsertMissionState,
  updateMissionStateStatus,
} from "@/lib/db-actions";
import { type MissionState } from "@/lib/schema";

export const RESUME_MISSION_TYPE = "resume_story";
export const COMPLETE_ARC_MISSION_TYPE = "complete_first_arc";
export const REVIVE_DORMANT_MISSION_TYPE = "revive_dormant_story";
export const EXPAND_UNIVERSE_MISSION_TYPE = "expand_story_universe";

const UNFINISHED_TARGET_PAGES = 4;
const DORMANT_STORY_THRESHOLD_DAYS = 3;
const EXPAND_STORY_THRESHOLD_DAYS = 10;
const MAX_OPEN_MISSIONS = 8;

export type RetentionMissionStatus =
  | "open"
  | "completed"
  | "dismissed"
  | "snoozed";

export type RetentionMission = {
  id: string;
  missionType: string;
  status: RetentionMissionStatus;
  storyId: string;
  storySlug: string;
  storyTitle: string;
  pageCount: number;
  pendingPageCount: number;
  lastPromptedAt: string | null;
  updatedAt: string;
  summary: string;
};

type StoryMissionStats = {
  id: string;
  slug: string;
  title: string;
  pageCount: number;
  pendingPageCount: number;
  updatedAt: Date;
};

type MissionBlueprint = {
  missionType: string;
  metadata: Record<string, unknown>;
};

function getDormantDays(updatedAt: Date, now: Date): number {
  const milliseconds = now.getTime() - updatedAt.getTime();
  if (milliseconds <= 0) {
    return 0;
  }
  return Math.floor(milliseconds / (1000 * 60 * 60 * 24));
}

function getMetadataNumber(
  metadata: Record<string, unknown>,
  key: string,
): number | null {
  const value = metadata[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function getMissionPriority(missionType: string): number {
  if (missionType === RESUME_MISSION_TYPE) return 0;
  if (missionType === REVIVE_DORMANT_MISSION_TYPE) return 1;
  if (missionType === COMPLETE_ARC_MISSION_TYPE) return 2;
  if (missionType === EXPAND_UNIVERSE_MISSION_TYPE) return 3;
  return 9;
}

function buildDesiredMission(story: StoryMissionStats, now: Date): MissionBlueprint | null {
  const dormantDays = getDormantDays(story.updatedAt, now);

  if (story.pendingPageCount > 0) {
    return {
      missionType: RESUME_MISSION_TYPE,
      metadata: {
        pageCount: story.pageCount,
        pendingPageCount: story.pendingPageCount,
        dormantDays,
      },
    };
  }

  if (story.pageCount > 0 && story.pageCount < UNFINISHED_TARGET_PAGES) {
    const pagesRemaining = UNFINISHED_TARGET_PAGES - story.pageCount;
    if (dormantDays >= DORMANT_STORY_THRESHOLD_DAYS) {
      return {
        missionType: REVIVE_DORMANT_MISSION_TYPE,
        metadata: {
          pageCount: story.pageCount,
          pendingPageCount: story.pendingPageCount,
          pagesRemaining,
          dormantDays,
        },
      };
    }

    return {
      missionType: COMPLETE_ARC_MISSION_TYPE,
      metadata: {
        pageCount: story.pageCount,
        pendingPageCount: story.pendingPageCount,
        pagesRemaining,
        dormantDays,
      },
    };
  }

  if (story.pageCount >= UNFINISHED_TARGET_PAGES && dormantDays >= EXPAND_STORY_THRESHOLD_DAYS) {
    return {
      missionType: EXPAND_UNIVERSE_MISSION_TYPE,
      metadata: {
        pageCount: story.pageCount,
        pendingPageCount: story.pendingPageCount,
        dormantDays,
      },
    };
  }

  return null;
}

function shouldPreserveUserIntent(status: string): boolean {
  return status === "completed" || status === "dismissed";
}

function toMissionSummary({
  missionType,
  story,
  metadata,
  now,
}: {
  missionType: string;
  story: StoryMissionStats;
  metadata: Record<string, unknown>;
  now: Date;
}): string {
  if (missionType === RESUME_MISSION_TYPE) {
    if (story.pendingPageCount > 0) {
      return `Resume "${story.title}" and recover ${story.pendingPageCount} pending page(s).`;
    }
    return `Resume "${story.title}" and continue the next story beat.`;
  }

  if (missionType === COMPLETE_ARC_MISSION_TYPE) {
    const pagesRemaining =
      getMetadataNumber(metadata, "pagesRemaining") ??
      Math.max(UNFINISHED_TARGET_PAGES - story.pageCount, 0);
    return `Complete the opening arc of "${story.title}" (${pagesRemaining} page(s) remaining).`;
  }

  if (missionType === REVIVE_DORMANT_MISSION_TYPE) {
    const dormantDays =
      getMetadataNumber(metadata, "dormantDays") ?? getDormantDays(story.updatedAt, now);
    return `Revive "${story.title}" after ${dormantDays} dormant day(s) and ship the next page.`;
  }

  if (missionType === EXPAND_UNIVERSE_MISSION_TYPE) {
    return `Re-ignite "${story.title}" with a fresh arc beat to keep momentum alive.`;
  }

  return `Continue "${story.title}" and keep your story momentum up.`;
}

function toRetentionMission(
  state: MissionState,
  story: StoryMissionStats,
  now: Date,
): RetentionMission {
  return {
    id: state.id,
    missionType: state.missionType,
    status: state.status as RetentionMissionStatus,
    storyId: story.id,
    storySlug: story.slug,
    storyTitle: story.title,
    pageCount: story.pageCount,
    pendingPageCount: story.pendingPageCount,
    lastPromptedAt: state.lastPromptedAt ? state.lastPromptedAt.toISOString() : null,
    updatedAt: state.updatedAt.toISOString(),
    summary: toMissionSummary({
      missionType: state.missionType,
      story,
      metadata: state.metadata ?? {},
      now,
    }),
  };
}

export async function syncAndGetRetentionMissionsForUser(
  userId: string,
): Promise<RetentionMission[]> {
  const now = new Date();
  const stories = await getStoriesWithPageStatsForUser(userId);
  const existingMissions = await getMissionStatesForUser(userId);

  const existingByStory = new Map<string, MissionState[]>();
  for (const mission of existingMissions) {
    if (!mission.storyId) continue;
    const current = existingByStory.get(mission.storyId) ?? [];
    current.push(mission);
    existingByStory.set(mission.storyId, current);
  }

  for (const story of stories) {
    const desiredMission = buildDesiredMission(story, now);
    const storyMissions = existingByStory.get(story.id) ?? [];

    for (const mission of storyMissions) {
      const isActive = mission.status === "open" || mission.status === "snoozed";
      if (!isActive) {
        continue;
      }

      if (!desiredMission || mission.missionType !== desiredMission.missionType) {
        await updateMissionStateStatus({
          missionId: mission.id,
          userId,
          status: "dismissed",
        });
      }
    }

    if (!desiredMission) {
      continue;
    }

    const existingDesired = storyMissions.find(
      (mission) => mission.missionType === desiredMission.missionType,
    );

    if (existingDesired && shouldPreserveUserIntent(existingDesired.status)) {
      continue;
    }

    await upsertMissionState({
      userId,
      storyId: story.id,
      missionType: desiredMission.missionType,
      status: "open",
      metadata: desiredMission.metadata,
      lastPromptedAt: now,
    });
  }

  const storyMap = new Map(stories.map((story) => [story.id, story]));
  const currentMissions = await getMissionStatesForUser(userId);

  return currentMissions
    .filter((mission) => mission.status === "open" && mission.storyId)
    .map((mission) => {
      const story = storyMap.get(mission.storyId!);
      if (!story) {
        return null;
      }
      return toRetentionMission(mission, story, now);
    })
    .filter((mission): mission is RetentionMission => mission !== null)
    .sort((left, right) => {
      const priorityDiff =
        getMissionPriority(left.missionType) - getMissionPriority(right.missionType);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })
    .slice(0, MAX_OPEN_MISSIONS);
}

export async function setRetentionMissionStatus({
  missionId,
  userId,
  status,
}: {
  missionId: string;
  userId: string;
  status: RetentionMissionStatus;
}): Promise<MissionState | null> {
  return updateMissionStateStatus({
    missionId,
    userId,
    status,
  });
}
