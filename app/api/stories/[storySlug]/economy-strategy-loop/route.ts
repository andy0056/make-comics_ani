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
  applyCreatorEconomySelfHealingPatch,
  buildCreatorEconomySelfHealingReport,
} from "@/lib/creator-economy-self-healing";
import {
  buildCreatorEconomyStrategyLoopReport,
} from "@/lib/creator-economy-strategy-loop";
import { buildCreatorEconomyExecutionWindowReport } from "@/lib/creator-economy-window-loop";
import {
  buildCreatorEconomyOperatingPlan,
  normalizeCreatorEconomyMetrics,
} from "@/lib/creator-economy-orchestrator";
import {
  createStoryCreatorEconomyRun,
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
  cadenceHours: z.coerce.number().int().min(6).max(24).optional(),
  autoOptimize: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

const postBodySchema = z.object({
  objective: z.enum(CREATOR_ECONOMY_OPTIMIZATION_OBJECTIVES).optional(),
  mode: z.enum(CREATOR_ECONOMY_AUTONOMY_MODES).optional().default("assist"),
  sprintObjective: z.enum(ROLE_AGENT_SPRINT_OBJECTIVES).optional(),
  horizonDays: z.number().int().min(3).max(30).optional(),
  cadenceHours: z.number().int().min(6).max(24).optional(),
  autoOptimize: z.boolean().optional(),
  maxActions: z.number().int().min(1).max(5).optional(),
  executeWindow: z.boolean().optional().default(false),
  selfHeal: z.boolean().optional().default(false),
  executeRecovery: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
  persist: z.boolean().optional().default(true),
  force: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(30).optional(),
});

function isCreatorEconomyStrategyLoopEnabled(): boolean {
  return (
    isFeatureEnabled("creator_economy") &&
    isFeatureEnabled("economy_orchestrator") &&
    isFeatureEnabled("economy_automation") &&
    isFeatureEnabled("economy_policy_learning") &&
    isFeatureEnabled("economy_optimizer") &&
    isFeatureEnabled("economy_strategy_loop") &&
    isFeatureEnabled("economy_window_loop") &&
    isFeatureEnabled("economy_self_healing")
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
    automationPlan,
    operatingPlan,
  };
}

function buildStrategyState({
  historyRows,
  automationPlan,
  optimizedPolicy,
  optimizerReport,
  governance,
  learning,
  selectedObjective,
  cadenceHours,
  autoOptimize,
  maxActions,
}: {
  historyRows: Awaited<ReturnType<typeof listStoryCreatorEconomyRuns>>;
  automationPlan: ReturnType<typeof buildCreatorEconomyAutomationPlan>;
  optimizedPolicy: ReturnType<typeof applyCreatorEconomyOptimizerProfileToPolicy>;
  optimizerReport: ReturnType<typeof buildCreatorEconomyOptimizerReport>;
  governance: ReturnType<typeof buildCreatorEconomyGovernanceReport>;
  learning: ReturnType<typeof buildCreatorEconomyPolicyLearningReport>;
  selectedObjective: CreatorEconomyOptimizationObjective;
  cadenceHours?: number;
  autoOptimize?: boolean;
  maxActions?: number;
}) {
  const strategyLoop = buildCreatorEconomyStrategyLoopReport({
    policy: optimizedPolicy,
    optimizerReport,
    governance,
    learning,
    backlog: buildCreatorEconomyAutonomousBacklog({
      mode: optimizedPolicy.mode,
      automationPlan,
      policy: optimizedPolicy,
      history: historyRows,
    }),
    selectedObjective,
    cadenceHours,
    autoOptimize,
  });

  const primaryCycle = strategyLoop.cycles[0];
  const strategyPolicy = primaryCycle
    ? {
        ...optimizedPolicy,
        mode: primaryCycle.mode,
        maxActionsPerCycle: primaryCycle.maxActionsPerCycle,
        cooldownHours: primaryCycle.cooldownHours,
        rationale: [
          ...optimizedPolicy.rationale,
          `Strategy loop cycle 1 objective: ${primaryCycle.objective}.`,
        ],
      }
    : optimizedPolicy;

  const strategyBacklog = buildCreatorEconomyAutonomousBacklog({
    mode: strategyPolicy.mode,
    automationPlan,
    policy: strategyPolicy,
    history: historyRows,
  });
  const windowReport = buildCreatorEconomyExecutionWindowReport({
    strategyLoop,
    history: historyRows,
    learning,
    governance,
    backlog: strategyBacklog,
  });

  const previewExecution = selectCreatorEconomyBacklogExecutionItems({
    backlog: strategyBacklog,
    maxActions: maxActions ?? windowReport.preview.maxActions,
  }).map((item) => ({
    recommendationId: item.recommendationId,
    title: item.title,
    priority: item.priority,
    status: item.status,
    reason: item.reason,
    sprintObjective: item.execution.sprintObjective,
    horizonDays: item.execution.horizonDays,
  }));

  return {
    strategyLoop,
    strategyPolicy,
    strategyBacklog,
    windowReport,
    previewExecution,
  };
}

function buildSelfHealingState({
  strategyState,
  governance,
  learning,
}: {
  strategyState: ReturnType<typeof buildStrategyState>;
  governance: ReturnType<typeof buildCreatorEconomyGovernanceReport>;
  learning: ReturnType<typeof buildCreatorEconomyPolicyLearningReport>;
}) {
  return buildCreatorEconomySelfHealingReport({
    policy: strategyState.strategyPolicy,
    governance,
    learning,
    strategyLoop: strategyState.strategyLoop,
    windowReport: strategyState.windowReport,
    backlog: strategyState.strategyBacklog,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyStrategyLoopEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy strategy loop is disabled",
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
      cadenceHours: request.nextUrl.searchParams.get("cadenceHours") ?? undefined,
      autoOptimize: request.nextUrl.searchParams.get("autoOptimize") ?? undefined,
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

    const strategyState = buildStrategyState({
      historyRows: resolved.historyRows,
      automationPlan: snapshot.automationPlan,
      optimizedPolicy: snapshot.optimizedPolicy,
      optimizerReport: snapshot.optimizerReport,
      governance: snapshot.governance,
      learning: snapshot.learning,
      selectedObjective: snapshot.selectedObjective,
      cadenceHours: parsedQuery.data.cadenceHours,
      autoOptimize:
        parsedQuery.data.autoOptimize === undefined
          ? undefined
          : parsedQuery.data.autoOptimize === "true",
    });
    const selfHealingReport = buildSelfHealingState({
      strategyState,
      governance: snapshot.governance,
      learning: snapshot.learning,
    });

    return apiJson(
      {
        mode: strategyState.strategyPolicy.mode,
        objective: strategyState.strategyLoop.selectedObjective,
        cadenceHours: strategyState.strategyLoop.cadenceHours,
        autoOptimizeEnabled: strategyState.strategyLoop.autoOptimizeEnabled,
        learning: snapshot.learning,
        governance: snapshot.governance,
        optimizerReport: snapshot.optimizerReport,
        strategyLoop: strategyState.strategyLoop,
        windowReport: strategyState.windowReport,
        selfHealingReport,
        selfHealingPatchApplied: false,
        strategyPolicy: strategyState.strategyPolicy,
        strategyBacklog: strategyState.strategyBacklog,
        previewExecution: strategyState.previewExecution,
        executed: [],
        recoveryExecuted: [],
        skipped: [],
        blockedByWindowGate: false,
        history: resolved.historyRows
          .slice(0, parsedQuery.data.limit ?? 12)
          .map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-strategy-loop:GET",
      requestId,
      error,
      message: "Failed to load creator economy strategy loop",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyStrategyLoopEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy strategy loop is disabled",
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

    let strategyState = buildStrategyState({
      historyRows: resolved.historyRows,
      automationPlan: snapshot.automationPlan,
      optimizedPolicy: snapshot.optimizedPolicy,
      optimizerReport: snapshot.optimizerReport,
      governance: snapshot.governance,
      learning: snapshot.learning,
      selectedObjective: snapshot.selectedObjective,
      cadenceHours: parsedBody.data.cadenceHours,
      autoOptimize: parsedBody.data.autoOptimize,
      maxActions: parsedBody.data.maxActions,
    });

    const executed: Array<{
      recommendationId: string;
      title: string;
      runId: string | null;
      sprintObjective: (typeof ROLE_AGENT_SPRINT_OBJECTIVES)[number];
      horizonDays: number;
      status: "planned" | "dry_run";
    }> = [];
    const recoveryExecuted: Array<{
      recommendationId: string;
      title: string;
      runId: string | null;
      sprintObjective: (typeof ROLE_AGENT_SPRINT_OBJECTIVES)[number];
      horizonDays: number;
      status: "planned" | "dry_run";
    }> = [];

    let blockedByWindowGate = false;
    let historyRows = resolved.historyRows;
    let finalLearning = snapshot.learning;
    let finalGovernance = snapshot.governance;
    let selfHealingPatchApplied = false;
    let selfHealingReport = buildSelfHealingState({
      strategyState,
      governance: finalGovernance,
      learning: finalLearning,
    });
    let summary = `Strategy loop prepared ${strategyState.strategyLoop.cycles.length} cycle(s) at ${strategyState.strategyLoop.cadenceHours}h cadence (${strategyState.strategyLoop.autoOptimizeEnabled ? "auto-optimized" : "operator-controlled"}).`;

    if (parsedBody.data.selfHeal || parsedBody.data.executeRecovery) {
      const selfHealingPatchedPolicy = applyCreatorEconomySelfHealingPatch({
        policy: strategyState.strategyPolicy,
        report: selfHealingReport,
      });

      strategyState = buildStrategyState({
        historyRows,
        automationPlan: snapshot.automationPlan,
        optimizedPolicy: selfHealingPatchedPolicy,
        optimizerReport: snapshot.optimizerReport,
        governance: finalGovernance,
        learning: finalLearning,
        selectedObjective: selfHealingReport.policyPatch.objective,
        cadenceHours: selfHealingReport.policyPatch.cadenceHours,
        autoOptimize: false,
        maxActions:
          parsedBody.data.maxActions ??
          selfHealingReport.policyPatch.maxActionsPerCycle,
      });
      selfHealingPatchApplied = true;
      selfHealingReport = buildSelfHealingState({
        strategyState,
        governance: finalGovernance,
        learning: finalLearning,
      });

      summary = `Self-healing patch applied (${selfHealingReport.severity}) with ${selfHealingReport.policyPatch.cadenceHours}h cadence and ${selfHealingReport.policyPatch.maxActionsPerCycle} max action(s).`;
    }

    if (parsedBody.data.executeRecovery) {
      const byRecommendationId = new Map(
        strategyState.strategyBacklog.items.map((item) => [item.recommendationId, item]),
      );
      const maxActions =
        parsedBody.data.maxActions ?? selfHealingReport.policyPatch.maxActionsPerCycle;
      const selectedRecoveryItems = selfHealingReport.recoveryPlan
        .filter((item) => item.status === "ready")
        .map((item) => byRecommendationId.get(item.recommendationId))
        .filter(
          (
            item,
          ): item is (typeof strategyState.strategyBacklog.items)[number] =>
            Boolean(item),
        )
        .slice(0, maxActions);

      const createdRecoveryRuns: Awaited<ReturnType<typeof createStoryCreatorEconomyRun>>[] = [];

      for (const item of selectedRecoveryItems) {
        const createdRun =
          parsedBody.data.persist && !parsedBody.data.dryRun
            ? await createStoryCreatorEconomyRun({
                storyId: resolved.storyAccess.story.id,
                createdByUserId: userId,
                sprintObjective: item.execution.sprintObjective,
                horizonDays: item.execution.horizonDays,
                status: "planned",
                plan: {
                  source: "economy_self_healing",
                  executedRecommendationId: item.recommendationId,
                  severity: selfHealingReport.severity,
                  roiGapScore: selfHealingReport.roiGapScore,
                  targetObjective: selfHealingReport.policyPatch.objective,
                  cadenceHours: selfHealingReport.policyPatch.cadenceHours,
                  triggers: selfHealingReport.triggers,
                  strategyPolicy: strategyState.strategyPolicy,
                },
                baselineMetrics: snapshot.operatingPlan.baselineMetrics,
              })
            : null;

        if (createdRun) {
          createdRecoveryRuns.push(createdRun);
        }

        const executionStatus: "planned" | "dry_run" = parsedBody.data.dryRun
          ? "dry_run"
          : "planned";
        const executionSummary = {
          recommendationId: item.recommendationId,
          title: item.title,
          runId: createdRun?.id ?? null,
          sprintObjective: item.execution.sprintObjective,
          horizonDays: item.execution.horizonDays,
          status: executionStatus,
        };
        recoveryExecuted.push(executionSummary);
        executed.push(executionSummary);
      }

      historyRows =
        createdRecoveryRuns.length > 0
          ? [...createdRecoveryRuns, ...historyRows]
          : historyRows;

      const refreshedLearning = buildCreatorEconomyPolicyLearningReport({
        history: historyRows,
      });
      const refreshedPreliminaryBacklog = buildCreatorEconomyAutonomousBacklog({
        mode: strategyState.strategyPolicy.mode,
        automationPlan: snapshot.automationPlan,
        policy: strategyState.strategyPolicy,
        history: historyRows,
      });
      const refreshedGovernance = buildCreatorEconomyGovernanceReport({
        history: historyRows,
        learning: refreshedLearning,
        policy: strategyState.strategyPolicy,
        backlog: refreshedPreliminaryBacklog,
      });
      const refreshedGovernedPolicy = applyGovernanceToDecisionPolicy({
        policy: strategyState.strategyPolicy,
        governance: refreshedGovernance,
      });

      strategyState = buildStrategyState({
        historyRows,
        automationPlan: snapshot.automationPlan,
        optimizedPolicy: refreshedGovernedPolicy,
        optimizerReport: snapshot.optimizerReport,
        governance: refreshedGovernance,
        learning: refreshedLearning,
        selectedObjective: selfHealingReport.policyPatch.objective,
        cadenceHours: selfHealingReport.policyPatch.cadenceHours,
        autoOptimize: false,
        maxActions:
          parsedBody.data.maxActions ??
          selfHealingReport.policyPatch.maxActionsPerCycle,
      });
      finalLearning = refreshedLearning;
      finalGovernance = refreshedGovernance;
      selfHealingReport = buildSelfHealingState({
        strategyState,
        governance: finalGovernance,
        learning: finalLearning,
      });

      summary =
        recoveryExecuted.length > 0
          ? `${parsedBody.data.dryRun ? "Previewed" : "Executed"} ${recoveryExecuted.length} self-healing recovery action(s). ROI gap now ${selfHealingReport.roiGapScore}.`
          : "Self-healing found no execution-ready recovery items in the current window.";
    }

    if (parsedBody.data.executeWindow) {
      const gateStatus = strategyState.windowReport.gate.status;
      if (gateStatus !== "ready" && !parsedBody.data.force) {
        blockedByWindowGate = true;
        summary = `Execution window blocked by ${gateStatus} gate. ${strategyState.windowReport.gate.reasons[0] ?? "Review window gate conditions before executing."}`;
      } else {
        const maxActions =
          parsedBody.data.maxActions ?? strategyState.windowReport.preview.maxActions;
        const selectedItems = selectCreatorEconomyBacklogExecutionItems({
          backlog: strategyState.strategyBacklog,
          maxActions,
        });

        const createdRuns: Awaited<ReturnType<typeof createStoryCreatorEconomyRun>>[] = [];
        for (const item of selectedItems) {
          const createdRun =
            parsedBody.data.persist && !parsedBody.data.dryRun
              ? await createStoryCreatorEconomyRun({
                  storyId: resolved.storyAccess.story.id,
                  createdByUserId: userId,
                  sprintObjective: item.execution.sprintObjective,
                  horizonDays: item.execution.horizonDays,
                  status: "planned",
                  plan: {
                    source: "economy_window_loop",
                    executedRecommendationId: item.recommendationId,
                    strategyCycle: strategyState.windowReport.activeCycle?.cycle ?? 1,
                    strategyObjective:
                      strategyState.windowReport.activeCycle?.objective ??
                      snapshot.selectedObjective,
                    cadenceHours: strategyState.strategyLoop.cadenceHours,
                    gateStatus: strategyState.windowReport.gate.status,
                    gateReasons: strategyState.windowReport.gate.reasons,
                    strategyPolicy: strategyState.strategyPolicy,
                  },
                  baselineMetrics: snapshot.operatingPlan.baselineMetrics,
                })
              : null;

          if (createdRun) {
            createdRuns.push(createdRun);
          }

          executed.push({
            recommendationId: item.recommendationId,
            title: item.title,
            runId: createdRun?.id ?? null,
            sprintObjective: item.execution.sprintObjective,
            horizonDays: item.execution.horizonDays,
            status: parsedBody.data.dryRun ? "dry_run" : "planned",
          });
        }

        historyRows = createdRuns.length > 0 ? [...createdRuns, ...historyRows] : historyRows;

        const refreshedLearning = buildCreatorEconomyPolicyLearningReport({
          history: historyRows,
        });
        const refreshedPreliminaryBacklog = buildCreatorEconomyAutonomousBacklog({
          mode: strategyState.strategyPolicy.mode,
          automationPlan: snapshot.automationPlan,
          policy: strategyState.strategyPolicy,
          history: historyRows,
        });
        const refreshedGovernance = buildCreatorEconomyGovernanceReport({
          history: historyRows,
          learning: refreshedLearning,
          policy: strategyState.strategyPolicy,
          backlog: refreshedPreliminaryBacklog,
        });
        const refreshedGovernedPolicy = applyGovernanceToDecisionPolicy({
          policy: strategyState.strategyPolicy,
          governance: refreshedGovernance,
        });

        strategyState = buildStrategyState({
          historyRows,
          automationPlan: snapshot.automationPlan,
          optimizedPolicy: refreshedGovernedPolicy,
          optimizerReport: snapshot.optimizerReport,
          governance: refreshedGovernance,
          learning: refreshedLearning,
          selectedObjective: strategyState.windowReport.adaptation.recommendedObjective,
          cadenceHours: strategyState.windowReport.adaptation.nextCadenceHours,
          autoOptimize: strategyState.strategyLoop.autoOptimizeEnabled,
          maxActions: parsedBody.data.maxActions,
        });
        finalLearning = refreshedLearning;
        finalGovernance = refreshedGovernance;
        selfHealingReport = buildSelfHealingState({
          strategyState,
          governance: finalGovernance,
          learning: finalLearning,
        });

        summary = `${parsedBody.data.dryRun ? "Previewed" : "Executed"} ${executed.length} recommendation(s). Next cadence suggestion: ${strategyState.windowReport.adaptation.nextCadenceHours}h (${strategyState.windowReport.adaptation.reason})`;
      }
    }

    const skipped = strategyState.strategyBacklog.items
      .filter((item) => item.status !== "ready")
      .map((item) => ({
        recommendationId: item.recommendationId,
        title: item.title,
        reason: item.reason,
      }));

    return apiJson(
      {
        mode: strategyState.strategyPolicy.mode,
        objective: strategyState.strategyLoop.selectedObjective,
        cadenceHours: strategyState.strategyLoop.cadenceHours,
        autoOptimizeEnabled: strategyState.strategyLoop.autoOptimizeEnabled,
        learning: finalLearning,
        governance: finalGovernance,
        optimizerReport: snapshot.optimizerReport,
        strategyLoop: strategyState.strategyLoop,
        windowReport: strategyState.windowReport,
        selfHealingReport,
        selfHealingPatchApplied,
        strategyPolicy: strategyState.strategyPolicy,
        strategyBacklog: strategyState.strategyBacklog,
        previewExecution: strategyState.previewExecution,
        executed,
        recoveryExecuted,
        skipped,
        blockedByWindowGate,
        summary,
        history: historyRows
          .slice(0, parsedBody.data.limit ?? 12)
          .map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-strategy-loop:POST",
      requestId,
      error,
      message: "Failed to simulate creator economy strategy loop",
    });
  }
}
