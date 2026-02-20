import { type RemixUniverseGraph } from "@/lib/remix-universe";

type UniverseInteractiveBranchVelocity = "fresh" | "rising" | "steady";

export type UniverseInteractiveBranch = {
  storyId: string;
  storySlug: string;
  storyTitle: string;
  style: string | null;
  updatedAt: string;
  remixCount: number;
  isCurrent: boolean;
  velocity: UniverseInteractiveBranchVelocity;
};

export type UniverseInteractivePathNode = {
  storyId: string;
  storySlug: string;
  storyTitle: string;
  isCurrent: boolean;
  isFocus: boolean;
};

export type UniverseInteractiveEpisode = {
  storyId: string;
  storySlug: string;
  storyTitle: string;
  style: string | null;
  depth: number;
  updatedAt: string;
  isCurrent: boolean;
  isRoot: boolean;
  isLeaf: boolean;
  promptHint: string;
  parent: {
    storyId: string;
    storySlug: string;
    storyTitle: string;
  } | null;
  branches: UniverseInteractiveBranch[];
};

export type UniverseInteractiveState = {
  generatedAt: string;
  rootStoryId: string;
  currentStoryId: string;
  focusStoryId: string;
  totalStories: number;
  totalBranches: number;
  path: UniverseInteractivePathNode[];
  episode: UniverseInteractiveEpisode;
  recommendation: {
    primaryBranchStoryId: string | null;
    reason: string;
  };
};

function classifyBranchVelocity({
  updatedAt,
  remixCount,
  now,
}: {
  updatedAt: string;
  remixCount: number;
  now: Date;
}): UniverseInteractiveBranchVelocity {
  const updatedTime = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedTime)) {
    return remixCount >= 2 ? "rising" : "steady";
  }
  const ageHours = (now.getTime() - updatedTime) / (1000 * 60 * 60);
  if (ageHours <= 36) {
    return "fresh";
  }
  if (remixCount >= 2 || ageHours <= 96) {
    return "rising";
  }
  return "steady";
}

function sortBranchesByPriority(
  left: UniverseInteractiveBranch,
  right: UniverseInteractiveBranch,
): number {
  const rank = (value: UniverseInteractiveBranchVelocity): number => {
    if (value === "fresh") return 3;
    if (value === "rising") return 2;
    return 1;
  };

  if (rank(left.velocity) !== rank(right.velocity)) {
    return rank(right.velocity) - rank(left.velocity);
  }
  if (left.remixCount !== right.remixCount) {
    return right.remixCount - left.remixCount;
  }
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

export function buildUniverseInteractiveState({
  graph,
  focusStoryId,
  now = new Date(),
}: {
  graph: RemixUniverseGraph;
  focusStoryId?: string | null;
  now?: Date;
}): UniverseInteractiveState | null {
  if (graph.nodes.length === 0) {
    return null;
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const resolvedFocusNode =
    (focusStoryId ? nodeById.get(focusStoryId) : undefined) ??
    nodeById.get(graph.currentStoryId) ??
    graph.nodes[0];
  if (!resolvedFocusNode) {
    return null;
  }

  const childrenBySourceId = new Map<string, string[]>();
  graph.edges.forEach((edge) => {
    const children = childrenBySourceId.get(edge.sourceStoryId) ?? [];
    children.push(edge.remixStoryId);
    childrenBySourceId.set(edge.sourceStoryId, children);
  });

  const parentNode = resolvedFocusNode.parentStoryId
    ? nodeById.get(resolvedFocusNode.parentStoryId) ?? null
    : null;
  const branchNodes = (childrenBySourceId.get(resolvedFocusNode.id) ?? [])
    .map((storyId) => nodeById.get(storyId))
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .map((node) => ({
      storyId: node.id,
      storySlug: node.slug,
      storyTitle: node.title,
      style: node.style,
      updatedAt: node.updatedAt,
      remixCount: node.remixCount,
      isCurrent: node.isCurrent,
      velocity: classifyBranchVelocity({
        updatedAt: node.updatedAt,
        remixCount: node.remixCount,
        now,
      }),
    }))
    .sort(sortBranchesByPriority);

  const recommendation =
    branchNodes[0] != null
      ? {
          primaryBranchStoryId: branchNodes[0].storyId,
          reason:
            branchNodes[0].velocity === "fresh"
              ? "Fresh branch momentum detected."
              : branchNodes[0].velocity === "rising"
                ? "Rising branch activity and remix energy."
                : "Most stable branch from this episode.",
        }
      : {
          primaryBranchStoryId: null,
          reason: "No downstream branches yet. Branch this episode to continue the universe.",
        };

  const path: UniverseInteractivePathNode[] = [];
  const visited = new Set<string>();
  let cursor: (typeof graph.nodes)[number] | null = resolvedFocusNode;
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    path.unshift({
      storyId: cursor.id,
      storySlug: cursor.slug,
      storyTitle: cursor.title,
      isCurrent: cursor.isCurrent,
      isFocus: cursor.id === resolvedFocusNode.id,
    });

    cursor = cursor.parentStoryId ? nodeById.get(cursor.parentStoryId) ?? null : null;
  }

  const styleLabel = resolvedFocusNode.style ?? "comic";
  const promptHint = branchNodes.length > 0
    ? `Continue "${resolvedFocusNode.title}" in ${styleLabel} style, then choose one of ${branchNodes.length} branch outcomes.`
    : `Branch "${resolvedFocusNode.title}" in ${styleLabel} style to start a new interactive outcome.`;

  return {
    generatedAt: now.toISOString(),
    rootStoryId: graph.rootStoryId,
    currentStoryId: graph.currentStoryId,
    focusStoryId: resolvedFocusNode.id,
    totalStories: graph.totalStories,
    totalBranches: graph.totalEdges,
    path,
    episode: {
      storyId: resolvedFocusNode.id,
      storySlug: resolvedFocusNode.slug,
      storyTitle: resolvedFocusNode.title,
      style: resolvedFocusNode.style,
      depth: resolvedFocusNode.depth,
      updatedAt: resolvedFocusNode.updatedAt,
      isCurrent: resolvedFocusNode.isCurrent,
      isRoot: resolvedFocusNode.isRoot,
      isLeaf: branchNodes.length === 0,
      promptHint,
      parent: parentNode
        ? {
            storyId: parentNode.id,
            storySlug: parentNode.slug,
            storyTitle: parentNode.title,
          }
        : null,
      branches: branchNodes,
    },
    recommendation,
  };
}
