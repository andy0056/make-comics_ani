export type RemixUniverseStoryRow = {
  id: string;
  slug: string;
  title: string;
  style: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RemixUniverseEdgeRow = {
  sourceStoryId: string;
  remixStoryId: string;
  createdAt: Date;
};

export type RemixUniverseNode = {
  id: string;
  slug: string;
  title: string;
  style: string | null;
  createdAt: string;
  updatedAt: string;
  parentStoryId: string | null;
  depth: number;
  remixCount: number;
  isCurrent: boolean;
  isRoot: boolean;
};

export type RemixUniverseEdge = {
  sourceStoryId: string;
  remixStoryId: string;
  createdAt: string;
};

export type RemixUniverseGraph = {
  currentStoryId: string;
  rootStoryId: string;
  totalStories: number;
  totalEdges: number;
  maxDepth: number;
  nodes: RemixUniverseNode[];
  edges: RemixUniverseEdge[];
};

export function buildRemixUniverseGraph({
  currentStoryId,
  stories,
  edges,
}: {
  currentStoryId: string;
  stories: RemixUniverseStoryRow[];
  edges: RemixUniverseEdgeRow[];
}): RemixUniverseGraph {
  const storyMap = new Map(stories.map((story) => [story.id, story]));
  const filteredEdges = edges.filter(
    (edge) => storyMap.has(edge.sourceStoryId) && storyMap.has(edge.remixStoryId),
  );

  const parentByStoryId = new Map<string, string>();
  const childrenByStoryId = new Map<string, string[]>();
  filteredEdges.forEach((edge) => {
    parentByStoryId.set(edge.remixStoryId, edge.sourceStoryId);
    const children = childrenByStoryId.get(edge.sourceStoryId) ?? [];
    children.push(edge.remixStoryId);
    childrenByStoryId.set(edge.sourceStoryId, children);
  });

  let rootStoryId = currentStoryId;
  const rootGuard = new Set<string>();
  while (parentByStoryId.has(rootStoryId) && !rootGuard.has(rootStoryId)) {
    rootGuard.add(rootStoryId);
    rootStoryId = parentByStoryId.get(rootStoryId)!;
  }

  const depthByStoryId = new Map<string, number>();
  const queue: string[] = [rootStoryId];
  depthByStoryId.set(rootStoryId, 0);

  while (queue.length > 0) {
    const storyId = queue.shift();
    if (!storyId) {
      continue;
    }

    const depth = depthByStoryId.get(storyId) ?? 0;
    const children = childrenByStoryId.get(storyId) ?? [];
    children.forEach((childId) => {
      if (!depthByStoryId.has(childId)) {
        depthByStoryId.set(childId, depth + 1);
        queue.push(childId);
      }
    });
  }

  // Some disconnected nodes may exist in rare partial-data scenarios.
  stories.forEach((story) => {
    if (!depthByStoryId.has(story.id)) {
      depthByStoryId.set(story.id, 0);
    }
  });

  const nodes: RemixUniverseNode[] = stories
    .map((story) => {
      const depth = depthByStoryId.get(story.id) ?? 0;
      const children = childrenByStoryId.get(story.id) ?? [];
      const parentStoryId = parentByStoryId.get(story.id) ?? null;

      return {
        id: story.id,
        slug: story.slug,
        title: story.title,
        style: story.style,
        createdAt: story.createdAt.toISOString(),
        updatedAt: story.updatedAt.toISOString(),
        parentStoryId,
        depth,
        remixCount: children.length,
        isCurrent: story.id === currentStoryId,
        isRoot: story.id === rootStoryId,
      };
    })
    .sort((left, right) => {
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }

      const leftUpdated = new Date(left.updatedAt).getTime();
      const rightUpdated = new Date(right.updatedAt).getTime();
      return rightUpdated - leftUpdated;
    });

  const maxDepth = nodes.reduce((maxValue, node) => Math.max(maxValue, node.depth), 0);

  return {
    currentStoryId,
    rootStoryId,
    totalStories: nodes.length,
    totalEdges: filteredEdges.length,
    maxDepth,
    nodes,
    edges: filteredEdges
      .map((edge) => ({
        sourceStoryId: edge.sourceStoryId,
        remixStoryId: edge.remixStoryId,
        createdAt: edge.createdAt.toISOString(),
      }))
      .sort((left, right) => {
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();
        return leftTime - rightTime;
      }),
  };
}
