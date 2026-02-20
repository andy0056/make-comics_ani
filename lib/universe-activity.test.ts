import { describe, expect, it } from "vitest";
import {
  buildUniverseActivityFeed,
  type UniverseActivityFeed,
} from "@/lib/universe-activity";
import { type RemixUniverseGraph } from "@/lib/remix-universe";

function createGraph(): RemixUniverseGraph {
  return {
    currentStoryId: "story-1",
    rootStoryId: "story-1",
    totalStories: 3,
    totalEdges: 2,
    maxDepth: 2,
    nodes: [
      {
        id: "story-1",
        slug: "story-1",
        title: "Root Story",
        style: "noir",
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-10T10:00:00.000Z",
        parentStoryId: null,
        depth: 0,
        remixCount: 3,
        isCurrent: true,
        isRoot: true,
      },
      {
        id: "story-2",
        slug: "story-2",
        title: "Branch Two",
        style: "manga",
        createdAt: "2026-02-08T00:00:00.000Z",
        updatedAt: "2026-02-10T11:00:00.000Z",
        parentStoryId: "story-1",
        depth: 1,
        remixCount: 1,
        isCurrent: false,
        isRoot: false,
      },
      {
        id: "story-3",
        slug: "story-3",
        title: "Branch Three",
        style: "vintage",
        createdAt: "2026-02-09T00:00:00.000Z",
        updatedAt: "2026-02-10T12:00:00.000Z",
        parentStoryId: "story-2",
        depth: 2,
        remixCount: 0,
        isCurrent: false,
        isRoot: false,
      },
    ],
    edges: [
      {
        sourceStoryId: "story-1",
        remixStoryId: "story-2",
        createdAt: "2026-02-09T08:00:00.000Z",
      },
      {
        sourceStoryId: "story-2",
        remixStoryId: "story-3",
        createdAt: "2026-02-10T08:30:00.000Z",
      },
    ],
  };
}

function assertEventTypes(feed: UniverseActivityFeed, expectedType: string) {
  expect(feed.events.some((event) => event.type === expectedType)).toBe(true);
}

describe("universe-activity", () => {
  it("builds sorted recent activity feed with branch and update events", () => {
    const feed = buildUniverseActivityFeed({
      graph: createGraph(),
      now: new Date("2026-02-11T00:00:00.000Z"),
      windowDays: 7,
      maxEvents: 20,
    });

    expect(feed.eventCount).toBeGreaterThan(0);
    expect(feed.events[0]?.happenedAt >= feed.events[1]?.happenedAt).toBe(true);
    assertEventTypes(feed, "branch_created");
    assertEventTypes(feed, "story_updated");
    assertEventTypes(feed, "remix_milestone");
  });

  it("respects recency window and event cap bounds", () => {
    const feed = buildUniverseActivityFeed({
      graph: createGraph(),
      now: new Date("2026-02-11T00:00:00.000Z"),
      windowDays: 1,
      maxEvents: 2,
    });

    expect(feed.events.length).toBeLessThanOrEqual(2);
    feed.events.forEach((event) => {
      const ageMs =
        new Date("2026-02-11T00:00:00.000Z").getTime() -
        new Date(event.happenedAt).getTime();
      expect(ageMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });
  });
});

