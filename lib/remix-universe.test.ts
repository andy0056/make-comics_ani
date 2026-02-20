import { describe, expect, it } from "vitest";
import { buildRemixUniverseGraph } from "@/lib/remix-universe";

describe("buildRemixUniverseGraph", () => {
  it("builds rooted depth map and lineage markers", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    const graph = buildRemixUniverseGraph({
      currentStoryId: "c",
      stories: [
        {
          id: "a",
          slug: "alpha",
          title: "Alpha",
          style: "noir",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "b",
          slug: "beta",
          title: "Beta",
          style: "manga",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "c",
          slug: "gamma",
          title: "Gamma",
          style: "vintage",
          createdAt: now,
          updatedAt: now,
        },
      ],
      edges: [
        {
          sourceStoryId: "a",
          remixStoryId: "b",
          createdAt: now,
        },
        {
          sourceStoryId: "b",
          remixStoryId: "c",
          createdAt: now,
        },
      ],
    });

    expect(graph.rootStoryId).toBe("a");
    expect(graph.maxDepth).toBe(2);
    const current = graph.nodes.find((node) => node.id === "c");
    expect(current?.isCurrent).toBe(true);
    expect(current?.parentStoryId).toBe("b");
    const root = graph.nodes.find((node) => node.id === "a");
    expect(root?.isRoot).toBe(true);
    expect(root?.remixCount).toBe(1);
  });

  it("filters edges pointing to unknown stories", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    const graph = buildRemixUniverseGraph({
      currentStoryId: "a",
      stories: [
        {
          id: "a",
          slug: "alpha",
          title: "Alpha",
          style: "noir",
          createdAt: now,
          updatedAt: now,
        },
      ],
      edges: [
        {
          sourceStoryId: "a",
          remixStoryId: "ghost",
          createdAt: now,
        },
      ],
    });

    expect(graph.totalStories).toBe(1);
    expect(graph.totalEdges).toBe(0);
    expect(graph.nodes[0]?.parentStoryId).toBeNull();
  });
});
