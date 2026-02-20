import { describe, expect, it } from "vitest";
import { type RemixUniverseGraph } from "@/lib/remix-universe";
import { buildUniverseInteractiveState } from "@/lib/universe-interactive";

function createGraph(): RemixUniverseGraph {
  return {
    currentStoryId: "story-b",
    rootStoryId: "story-a",
    totalStories: 4,
    totalEdges: 3,
    maxDepth: 2,
    nodes: [
      {
        id: "story-a",
        slug: "story-a",
        title: "Alpha Origin",
        style: "noir",
        createdAt: "2026-02-10T00:00:00.000Z",
        updatedAt: "2026-02-11T12:00:00.000Z",
        parentStoryId: null,
        depth: 0,
        remixCount: 2,
        isCurrent: false,
        isRoot: true,
      },
      {
        id: "story-b",
        slug: "story-b",
        title: "Beta Path",
        style: "cinematic",
        createdAt: "2026-02-11T00:00:00.000Z",
        updatedAt: "2026-02-14T11:00:00.000Z",
        parentStoryId: "story-a",
        depth: 1,
        remixCount: 1,
        isCurrent: true,
        isRoot: false,
      },
      {
        id: "story-c",
        slug: "story-c",
        title: "Gamma Path",
        style: "manga",
        createdAt: "2026-02-12T00:00:00.000Z",
        updatedAt: "2026-02-13T09:00:00.000Z",
        parentStoryId: "story-a",
        depth: 1,
        remixCount: 0,
        isCurrent: false,
        isRoot: false,
      },
      {
        id: "story-d",
        slug: "story-d",
        title: "Delta Ending",
        style: "vintage",
        createdAt: "2026-02-14T00:00:00.000Z",
        updatedAt: "2026-02-14T11:30:00.000Z",
        parentStoryId: "story-b",
        depth: 2,
        remixCount: 0,
        isCurrent: false,
        isRoot: false,
      },
    ],
    edges: [
      {
        sourceStoryId: "story-a",
        remixStoryId: "story-b",
        createdAt: "2026-02-11T00:00:00.000Z",
      },
      {
        sourceStoryId: "story-a",
        remixStoryId: "story-c",
        createdAt: "2026-02-12T00:00:00.000Z",
      },
      {
        sourceStoryId: "story-b",
        remixStoryId: "story-d",
        createdAt: "2026-02-14T11:10:00.000Z",
      },
    ],
  };
}

describe("buildUniverseInteractiveState", () => {
  it("builds episode path and branch recommendations for focus node", () => {
    const state = buildUniverseInteractiveState({
      graph: createGraph(),
      focusStoryId: "story-a",
      now: new Date("2026-02-14T12:00:00.000Z"),
    });

    expect(state).not.toBeNull();
    expect(state?.focusStoryId).toBe("story-a");
    expect(state?.path.map((node) => node.storyId)).toEqual(["story-a"]);
    expect(state?.episode.branches.length).toBe(2);
    expect(state?.recommendation.primaryBranchStoryId).toBe("story-b");
  });

  it("falls back to current story when focusStoryId is unknown", () => {
    const state = buildUniverseInteractiveState({
      graph: createGraph(),
      focusStoryId: "missing",
      now: new Date("2026-02-14T12:00:00.000Z"),
    });

    expect(state?.focusStoryId).toBe("story-b");
    expect(state?.path.map((node) => node.storyId)).toEqual(["story-a", "story-b"]);
  });

  it("returns null for empty graph", () => {
    const state = buildUniverseInteractiveState({
      graph: {
        currentStoryId: "none",
        rootStoryId: "none",
        totalStories: 0,
        totalEdges: 0,
        maxDepth: 0,
        nodes: [],
        edges: [],
      },
    });

    expect(state).toBeNull();
  });
});
