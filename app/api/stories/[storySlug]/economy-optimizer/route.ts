import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import {
  buildCreatorRoleAgentsBoard,
  ROLE_AGENT_SPRINT_OBJECTIVES,
} from "@/lib/collaborative-role-agents";
import { buildCreatorEconomyAutomationPlan } from "@/lib/creator-economy-automation";
import {
  applyGovernanceToDecisionPolicy,
  buildCreatorEconomyGovernanceReport,
} from "@/lib/creator-economy-governance";
import {
  applyCreatorEconomyOptimizerProfileToPolicy,
  buildCreatorEconomyOptimizerReport,
  CREATOR_ECONOMY_OPTIMIZATION_OBJECTIVES,
  type CreatorEconomyOptimizationObjective,
} from "@/lib/creator-economy-optimizer";
import {
  buildCreatorEconomyAutonomousBacklog,
  buildCreatorEconomyDecisionPolicy,
  CREATOR_ECONOMY_AUTONOMY_MODES,
  selectCreatorEconomyBacklogExecutionItems,
} from "@/lib/creator-economy-policy";
import {
  applyPolicyLearningToDecisionPolicy,
  buildCreatorEconomyPolicyLearningReport,
} from "@/lib/creator-economy-policy-learning";
import {
  buildCreatorEconomyOperatingPlan,
  normalizeCreatorEconomyMetrics,
} from "@/lib/creator-economy-orchestrator";
import {
  getCharacterDnaProfiles,
  getStoryCharacters,
  getStoryRemixLineage,
  getStoryWorld,
  listStoryCollaborators,
  listStoryCreatorEconomyRuns,
} from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { buildIpIncubatorReport } from "@/lib/ip-incubator";
import { buildAdvancedMerchabilityDetectorReport } from "@/lib/merchability-detector";
import { type Page, type Story } from "@/lib/schema";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const querySchema = z.object({
  objective: z.enum(CREATOR_ECONOMY_OPTIMIZATION_OBJECTIVES).optional(),
  mode: z.enum(CREATOR_ECONOMY_AUTONOMY_MODES).optional(),
  sprintObjective: z.enum(ROLE_AGENT_SPRINT_OBJECTIVES).optional(),
  horizonDays: z.coerce.number().int().min(3).max(30).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

const postBodySchema = z.object({
  objective: z.enum(CREATOR_ECONOMY_OPTIMIZATION_OBJECTIVES).optional(),
  mode: z.enum(CREATOR_ECONOMY_AUTONOMY_MODES).optional().default("assist"),
  sprintObjective: z.enum(ROLE_AGENT_SPRINT_OBJECTIVES).optional(),
  horizonDays: z.number().int().min(3).max(30).optional(),
  maxActions: z.number().int().min(1).max(5).optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

function isCreatorEconomyOptimizerEnabled(): boolean {
  return (
    isFeatureEnabled("creator_economy") &&
    isFeatureEnabled("economy_orchestrator") &&
    isFeatureEnabled("economy_automation") &&
    isFeatureEnabled("economy_policy_learning") &&
    isFeatureEnabled("economy_optimizer")
  );
}

function summarizeRun(run: {
  id: string;
  status: string;
  sprintObjective: string;
  horizonDays: number;
  createdAt: Date;
  completedAt: Date | null;
  baselineMetrics: Record<string, unknown>;
  outcomeMetrics: Record<string, unknown>;
  outcomeDecision: string | null;
  outcomeNotes: string | null;
}) {
  return {
    id: run.id,
    status: run.status,
    sprintObjective: run.sprintObjective,
    horizonDays: run.horizonDays,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    baselineMetrics: normalizeCreatorEconomyMetrics(run.baselineMetrics),
    outcomeMetrics: normalizeCreatorEconomyMetrics(run.outcomeMetrics),
    outcomeDecision: run.outcomeDecision,
    outcomeNotes: run.outcomeNotes,
  };
}

async function resolveStoryContext({
  storySlug,
  userId,
}: {
  storySlug: string;
  userId: string;
}) {
  const storyAccess = await getOwnedStoryWithPagesBySlug({
    storySlug,
    userId,
    unauthorizedMode: "unauthorized",
    requiredPermission: "view",
  });

  if (!storyAccess.ok) {
    return storyAccess;
  }

  const [world, characters, characterDnaProfiles, remixLineage, collaborators, historyRows] =
    await Promise.all([
      getStoryWorld(storyAccess.story.id),
      getStoryCharacters(storyAccess.story.id),
      getCharacterDnaProfiles(storyAccess.story.id),
      getStoryRemixLineage(storyAccess.story.id),
      listStoryCollaborators(storyAccess.story.id),
      listStoryCreatorEconomyRuns({ storyId: storyAccess.story.id, limit: 30 }),
    ]);

  return {
    ok: true as const,
    storyAccess,
    world,
    characters,
    characterDnaProfiles,
    remixLineage,
    collaborators,
    historyRows,
  };
}

function buildOptimizationSnapshot({
  story,
  pages,
  world,
  characters,
  characterDnaProfiles,
  remixLineage,
  collaborators,
  historyRows,
  mode,
  sprintObjective,
  horizonDays,
  objective,
}: {
  story: Story;
  pages: Page[];
  world: Awaited<ReturnType<typeof getStoryWorld>>;
  characters: Awaited<ReturnType<typeof getStoryCharacters>>;
  characterDnaProfiles: Awaited<ReturnType<typeof getCharacterDnaProfiles>>;
  remixLineage: Awaited<ReturnType<typeof getStoryRemixLineage>>;
  collaborators: Awaited<ReturnType<typeof listStoryCollaborators>>;
  historyRows: Awaited<ReturnType<typeof listStoryCreatorEconomyRuns>>;
  mode: (typeof CREATOR_ECONOMY_AUTONOMY_MODES)[number];
  sprintObjective: (typeof ROLE_AGENT_SPRINT_OBJECTIVES)[number];
  horizonDays: number;
  objective?: CreatorEconomyOptimizationObjective;
}) {
  const ipReport = buildIpIncubatorReport({
    story,
    pages,
    world,
    characters,
    characterDnaProfiles,
    remixLineage,
  });

  const merchReport = buildAdvancedMerchabilityDetectorReport({
    story,
    pages,
    world,
    characters,
    characterDnaProfiles,
    remixLineage,
  });

  const roleBoard = buildCreatorRoleAgentsBoard({
    story,
    collaborators,
    ipReport,
    merchReport,
    sprintObjective,
    horizonDays,
  });

  const latestRun = historyRows[0] ?? null;
  const previousMetrics = latestRun
    ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics).combinedScore !==
      undefined
      ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics)
      : normalizeCreatorEconomyMetrics(latestRun.baselineMetrics)
    : {};

  const operatingPlan = buildCreatorEconomyOperatingPlan({
    story,
    ipReport,
    merchReport,
    roleBoard,
    merchPlan: null,
    previousMetrics,
  });

  const automationPlan = buildCreatorEconomyAutomationPlan({
    story,
    operatingPlan,
    roleBoard,
    merchReport,
    history: historyRows,
  });

  const basePolicy = buildCreatorEconomyDecisionPolicy({
    mode,
    automationPlan,
    operatingPlan,
    history: historyRows,
  });
  const learning = buildCreatorEconomyPolicyLearningReport({
    history: historyRows,
  });
  const learningAdjustedPolicy = applyPolicyLearningToDecisionPolicy({
    policy: basePolicy,
    learning,
    lockMode: mode,
  });
  const learningBacklog = buildCreatorEconomyAutonomousBacklog({
    mode,
    automationPlan,
    policy: learningAdjustedPolicy,
    history: historyRows,
  });
  const governance = buildCreatorEconomyGovernanceReport({
    history: historyRows,
    learning,
    policy: learningAdjustedPolicy,
    backlog: learningBacklog,
  });
  const governanceAdjustedPolicy = applyGovernanceToDecisionPolicy({
    policy: learningAdjustedPolicy,
    governance,
  });
  const governanceBacklog = buildCreatorEconomyAutonomousBacklog({
    mode,
    automationPlan,
    policy: governanceAdjustedPolicy,
    history: historyRows,
  });

  const optimizerReport = buildCreatorEconomyOptimizerReport({
    policy: governanceAdjustedPolicy,
    learning,
    governance,
    backlog: governanceBacklog,
  });
  const selectedObjective = objective ?? optimizerReport.recommendedObjective;
  const optimizedPolicy = applyCreatorEconomyOptimizerProfileToPolicy({
    policy: governanceAdjustedPolicy,
    report: optimizerReport,
    objective: selectedObjective,
  });
  const optimizedBacklog = buildCreatorEconomyAutonomousBacklog({
    mode: optimizedPolicy.mode,
    automationPlan,
    policy: optimizedPolicy,
    history: historyRows,
  });

  return {
    learning,
    governance,
    optimizerReport,
    selectedObjective,
    optimizedPolicy,
    optimizedBacklog,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyOptimizerEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy optimizer is disabled",
        requestId,
      });
    }

    const { userId } = await auth();
    if (!userId) {
      return apiError({
        status: 401,
        error: "Authentication required",
        requestId,
      });
    }

    const { storySlug } = await params;
    if (!storySlug) {
      return apiError({
        status: 400,
        error: "Story slug is required",
        requestId,
      });
    }

    const parsedQuery = querySchema.safeParse({
      objective: request.nextUrl.searchParams.get("objective") ?? undefined,
      mode: request.nextUrl.searchParams.get("mode") ?? undefined,
      sprintObjective: request.nextUrl.searchParams.get("sprintObjective") ?? undefined,
      horizonDays: request.nextUrl.searchParams.get("horizonDays") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });
    if (!parsedQuery.success) {
      return apiError({
        status: 400,
        error: "Invalid query parameters",
        details: parsedQuery.error.flatten(),
        requestId,
      });
    }

    const resolved = await resolveStoryContext({
      storySlug,
      userId,
    });
    if (!resolved.ok) {
      return apiError({
        status: resolved.status,
        error: resolved.error,
        requestId,
      });
    }

    const mode = parsedQuery.data.mode ?? "assist";
    const sprintObjective = parsedQuery.data.sprintObjective ?? "ship_next_drop";
    const horizonDays = parsedQuery.data.horizonDays ?? 7;

    const snapshot = buildOptimizationSnapshot({
      story: resolved.storyAccess.story,
      pages: resolved.storyAccess.pages,
      world: resolved.world,
      characters: resolved.characters,
      characterDnaProfiles: resolved.characterDnaProfiles,
      remixLineage: resolved.remixLineage,
      collaborators: resolved.collaborators,
      historyRows: resolved.historyRows,
      mode,
      sprintObjective,
      horizonDays,
      objective: parsedQuery.data.objective,
    });

    const previewExecution = selectCreatorEconomyBacklogExecutionItems({
      backlog: snapshot.optimizedBacklog,
      maxActions: snapshot.optimizedPolicy.maxActionsPerCycle,
    }).map((item) => ({
      recommendationId: item.recommendationId,
      title: item.title,
      priority: item.priority,
      status: item.status,
      reason: item.reason,
      sprintObjective: item.execution.sprintObjective,
      horizonDays: item.execution.horizonDays,
    }));

    return apiJson(
      {
        mode,
        objective: snapshot.selectedObjective,
        learning: snapshot.learning,
        governance: snapshot.governance,
        optimizerReport: snapshot.optimizerReport,
        optimizedPolicy: snapshot.optimizedPolicy,
        optimizedBacklog: snapshot.optimizedBacklog,
        previewExecution,
        history: resolved.historyRows
          .slice(0, parsedQuery.data.limit ?? 12)
          .map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-optimizer:GET",
      requestId,
      error,
      message: "Failed to load creator economy optimizer",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyOptimizerEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy optimizer is disabled",
        requestId,
      });
    }

    const { userId } = await auth();
    if (!userId) {
      return apiError({
        status: 401,
        error: "Authentication required",
        requestId,
      });
    }

    const { storySlug } = await params;
    if (!storySlug) {
      return apiError({
        status: 400,
        error: "Story slug is required",
        requestId,
      });
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      requestBody = {};
    }

    const parsedBody = postBodySchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const resolved = await resolveStoryContext({
      storySlug,
      userId,
    });
    if (!resolved.ok) {
      return apiError({
        status: resolved.status,
        error: resolved.error,
        requestId,
      });
    }

    const sprintObjective = parsedBody.data.sprintObjective ?? "ship_next_drop";
    const horizonDays = parsedBody.data.horizonDays ?? 7;

    const snapshot = buildOptimizationSnapshot({
      story: resolved.storyAccess.story,
      pages: resolved.storyAccess.pages,
      world: resolved.world,
      characters: resolved.characters,
      characterDnaProfiles: resolved.characterDnaProfiles,
      remixLineage: resolved.remixLineage,
      collaborators: resolved.collaborators,
      historyRows: resolved.historyRows,
      mode: parsedBody.data.mode,
      sprintObjective,
      horizonDays,
      objective: parsedBody.data.objective,
    });

    const maxActions = parsedBody.data.maxActions ?? snapshot.optimizedPolicy.maxActionsPerCycle;
    const previewExecution = selectCreatorEconomyBacklogExecutionItems({
      backlog: snapshot.optimizedBacklog,
      maxActions,
    }).map((item) => ({
      recommendationId: item.recommendationId,
      title: item.title,
      priority: item.priority,
      status: item.status,
      reason: item.reason,
      sprintObjective: item.execution.sprintObjective,
      horizonDays: item.execution.horizonDays,
    }));

    return apiJson(
      {
        mode: snapshot.optimizedPolicy.mode,
        objective: snapshot.selectedObjective,
        learning: snapshot.learning,
        governance: snapshot.governance,
        optimizerReport: snapshot.optimizerReport,
        optimizedPolicy: snapshot.optimizedPolicy,
        optimizedBacklog: snapshot.optimizedBacklog,
        previewExecution,
        summary: `Optimizer prepared ${previewExecution.length} execution-ready recommendation(s).`,
        history: resolved.historyRows
          .slice(0, parsedBody.data.limit ?? 12)
          .map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-optimizer:POST",
      requestId,
      error,
      message: "Failed to simulate creator economy optimizer cycle",
    });
  }
}
