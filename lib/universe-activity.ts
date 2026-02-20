import { type RemixUniverseGraph } from "@/lib/remix-universe";

type UniverseActivityEventType =
  | "branch_created"
  | "story_updated"
  | "remix_milestone";

export type UniverseActivityEvent = {
  id: string;
  type: UniverseActivityEventType;
  storyId: string;
  storySlug: string;
  storyTitle: string;
  relatedStoryId: string | null;
  relatedStorySlug: string | null;
  relatedStoryTitle: string | null;
  message: string;
  happenedAt: string;
};

export type UniverseActivityFeed = {
  generatedAt: string;
  eventCount: number;
  events: UniverseActivityEvent[];
  activeBranches: Array<{
    storyId: string;
    storySlug: string;
    storyTitle: string;
    remixCount: number;
    updatedAt: string;
    isCurrent: boolean;
  }>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function buildUniverseActivityFeed({
  graph,
  now = new Date(),
  windowDays = 14,
  maxEvents = 30,
}: {
  graph: RemixUniverseGraph;
  now?: Date;
  windowDays?: number;
  maxEvents?: number;
}): UniverseActivityFeed {
  const boundedWindowDays = clamp(windowDays, 1, 90);
  const boundedMaxEvents = clamp(maxEvents, 1, 120);
  const windowThreshold = new Date(
    now.getTime() - boundedWindowDays * 24 * 60 * 60 * 1000,
  );

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const events: UniverseActivityEvent[] = [];
  const seenEventIds = new Set<string>();

  const pushEvent = (event: UniverseActivityEvent) => {
    if (seenEventIds.has(event.id)) {
      return;
    }
    const happenedAt = new Date(event.happenedAt);
    if (Number.isNaN(happenedAt.getTime()) || happenedAt < windowThreshold) {
      return;
    }
    seenEventIds.add(event.id);
    events.push(event);
  };

  graph.edges.forEach((edge) => {
    const sourceNode = nodeById.get(edge.sourceStoryId);
    const remixNode = nodeById.get(edge.remixStoryId);
    if (!sourceNode || !remixNode) {
      return;
    }

    pushEvent({
      id: `branch:${edge.sourceStoryId}:${edge.remixStoryId}:${edge.createdAt}`,
      type: "branch_created",
      storyId: remixNode.id,
      storySlug: remixNode.slug,
      storyTitle: remixNode.title,
      relatedStoryId: sourceNode.id,
      relatedStorySlug: sourceNode.slug,
      relatedStoryTitle: sourceNode.title,
      message: `${remixNode.title} branched from ${sourceNode.title}.`,
      happenedAt: edge.createdAt,
    });
  });

  graph.nodes.forEach((node) => {
    const createdAt = new Date(node.createdAt);
    const updatedAt = new Date(node.updatedAt);
    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())) {
      return;
    }

    // Skip stories that have not meaningfully changed since creation.
    if (updatedAt.getTime() - createdAt.getTime() < 2 * 60 * 1000) {
      return;
    }

    pushEvent({
      id: `updated:${node.id}:${node.updatedAt}`,
      type: "story_updated",
      storyId: node.id,
      storySlug: node.slug,
      storyTitle: node.title,
      relatedStoryId: null,
      relatedStorySlug: null,
      relatedStoryTitle: null,
      message: `${node.title} pushed new changes to its branch.`,
      happenedAt: node.updatedAt,
    });

    if (node.remixCount >= 3) {
      pushEvent({
        id: `milestone:${node.id}:${node.remixCount}:${node.updatedAt}`,
        type: "remix_milestone",
        storyId: node.id,
        storySlug: node.slug,
        storyTitle: node.title,
        relatedStoryId: null,
        relatedStorySlug: null,
        relatedStoryTitle: null,
        message: `${node.title} reached ${node.remixCount} branch remixes.`,
        happenedAt: node.updatedAt,
      });
    }
  });

  const sortedEvents = events
    .sort((left, right) => {
      const leftTime = new Date(left.happenedAt).getTime();
      const rightTime = new Date(right.happenedAt).getTime();
      return rightTime - leftTime;
    })
    .slice(0, boundedMaxEvents);

  const activeBranches = [...graph.nodes]
    .sort((left, right) => {
      if (left.remixCount !== right.remixCount) {
        return right.remixCount - left.remixCount;
      }
      return (
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    })
    .slice(0, 6)
    .map((node) => ({
      storyId: node.id,
      storySlug: node.slug,
      storyTitle: node.title,
      remixCount: node.remixCount,
      updatedAt: node.updatedAt,
      isCurrent: node.isCurrent,
    }));

  return {
    generatedAt: now.toISOString(),
    eventCount: sortedEvents.length,
    events: sortedEvents,
    activeBranches,
  };
}

