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
  ROLE_AGENT_IDS,
  ROLE_AGENT_SPRINT_OBJECTIVES,
} from "@/lib/collaborative-role-agents";
import { buildCreatorEconomyAutomationPlan } from "@/lib/creator-economy-automation";
import {
  buildCreatorEconomyAutonomousBacklog,
  buildCreatorEconomyDecisionPolicy,
  CREATOR_ECONOMY_AUTONOMY_MODES,
  selectCreatorEconomyBacklogExecutionItems,
} from "@/lib/creator-economy-policy";
import {
  applyGovernanceToDecisionPolicy,
  buildCreatorEconomyGovernanceReport,
} from "@/lib/creator-economy-governance";
import {
  applyPolicyLearningToDecisionPolicy,
  buildCreatorEconomyPolicyLearningReport,
} from "@/lib/creator-economy-policy-learning";
import {
  buildCreatorEconomyOperatingPlan,
  normalizeCreatorEconomyMetrics,
} from "@/lib/creator-economy-orchestrator";
import { buildCreatorEconomyOutcomeAgentPlan } from "@/lib/creator-economy-outcome-agent";
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
import {
  buildAdvancedMerchabilityDetectorReport,
  buildMerchExperimentPlan,
} from "@/lib/merchability-detector";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const postBodySchema = z.object({
  mode: z.enum(CREATOR_ECONOMY_AUTONOMY_MODES).default("assist"),
  maxActions: z.number().int().min(1).max(5).optional(),
  ownerOverrides: z
    .array(
      z.object({
        roleId: z.enum(ROLE_AGENT_IDS),
        ownerUserId: z.string().trim().min(1),
      }),
    )
    .max(ROLE_AGENT_IDS.length)
    .optional(),
  persist: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});

function isCreatorEconomyAutorunEnabled(): boolean {
  return (
    isFeatureEnabled("creator_economy") &&
    isFeatureEnabled("economy_orchestrator") &&
    isFeatureEnabled("economy_automation") &&
    isFeatureEnabled("economy_autorun") &&
    isFeatureEnabled("economy_policy_learning")
  );
}

function createOverrideMap(
  overrides:
    | Array<{ roleId: (typeof ROLE_AGENT_IDS)[number]; ownerUserId: string }>
    | undefined,
): Partial<Record<(typeof ROLE_AGENT_IDS)[number], string>> {
  const map: Partial<Record<(typeof ROLE_AGENT_IDS)[number], string>> = {};
  for (const entry of overrides ?? []) {
    map[entry.roleId] = entry.ownerUserId;
  }
  return map;
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
    requiredPermission: "edit",
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
      listStoryCreatorEconomyRuns({ storyId: storyAccess.story.id, limit: 20 }),
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyAutorunEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy autorun is disabled",
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

    if (parsedBody.data.mode === "manual") {
      return apiError({
        status: 400,
        error: "Manual mode does not support autorun execution",
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

    const ipReport = buildIpIncubatorReport({
      story: resolved.storyAccess.story,
      pages: resolved.storyAccess.pages,
      world: resolved.world,
      characters: resolved.characters,
      characterDnaProfiles: resolved.characterDnaProfiles,
      remixLineage: resolved.remixLineage,
    });

    const merchReport = buildAdvancedMerchabilityDetectorReport({
      story: resolved.storyAccess.story,
      pages: resolved.storyAccess.pages,
      world: resolved.world,
      characters: resolved.characters,
      characterDnaProfiles: resolved.characterDnaProfiles,
      remixLineage: resolved.remixLineage,
    });

    const allowedUserIds = new Set<string>([
      resolved.storyAccess.story.userId,
      ...resolved.collaborators.map((collaborator) => collaborator.userId),
    ]);
    for (const override of parsedBody.data.ownerOverrides ?? []) {
      if (!allowedUserIds.has(override.ownerUserId)) {
        return apiError({
          status: 400,
          error: "Invalid role owner override user",
          details: override,
          requestId,
        });
      }
    }

    const latestRun = resolved.historyRows[0] ?? null;
    const previousMetrics = latestRun
      ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics).combinedScore !==
        undefined
        ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics)
        : normalizeCreatorEconomyMetrics(latestRun.baselineMetrics)
      : {};

    const seedRoleBoard = buildCreatorRoleAgentsBoard({
      story: resolved.storyAccess.story,
      collaborators: resolved.collaborators,
      ipReport,
      merchReport,
      sprintObjective: "ship_next_drop",
      horizonDays: 7,
    });

    const seedOperatingPlan = buildCreatorEconomyOperatingPlan({
      story: resolved.storyAccess.story,
      ipReport,
      merchReport,
      roleBoard: seedRoleBoard,
      merchPlan: null,
      previousMetrics,
    });

    const seedAutomationPlan = buildCreatorEconomyAutomationPlan({
      story: resolved.storyAccess.story,
      operatingPlan: seedOperatingPlan,
      roleBoard: seedRoleBoard,
      merchReport,
      history: resolved.historyRows,
    });

    const baseDecisionPolicy = buildCreatorEconomyDecisionPolicy({
      mode: parsedBody.data.mode,
      automationPlan: seedAutomationPlan,
      operatingPlan: seedOperatingPlan,
      history: resolved.historyRows,
    });
    const policyLearning = buildCreatorEconomyPolicyLearningReport({
      history: resolved.historyRows,
    });
    const decisionPolicy = applyPolicyLearningToDecisionPolicy({
      policy: baseDecisionPolicy,
      learning: policyLearning,
      lockMode: parsedBody.data.mode,
    });

    const preliminaryBacklog = buildCreatorEconomyAutonomousBacklog({
      mode: parsedBody.data.mode,
      automationPlan: seedAutomationPlan,
      policy: decisionPolicy,
      history: resolved.historyRows,
    });
    const governance = buildCreatorEconomyGovernanceReport({
      history: resolved.historyRows,
      learning: policyLearning,
      policy: decisionPolicy,
      backlog: preliminaryBacklog,
    });
    const governedPolicy = applyGovernanceToDecisionPolicy({
      policy: decisionPolicy,
      governance,
    });
    const backlog = buildCreatorEconomyAutonomousBacklog({
      mode: parsedBody.data.mode,
      automationPlan: seedAutomationPlan,
      policy: governedPolicy,
      history: resolved.historyRows,
    });
    const seedOutcomeAgentPlan = isFeatureEnabled("economy_outcome_agent")
      ? buildCreatorEconomyOutcomeAgentPlan({
          history: resolved.historyRows,
          currentMetrics: seedOperatingPlan.baselineMetrics,
          learning: policyLearning,
        })
      : null;

    if (!governance.constraints.allowAutorun && !parsedBody.data.force) {
      return apiJson(
        {
          mode: parsedBody.data.mode,
          dryRun: parsedBody.data.dryRun,
          blockedByGovernance: true,
          decisionPolicy: governedPolicy,
          policyLearning,
          governance,
          outcomeAgentPlan: seedOutcomeAgentPlan,
          backlog,
          executed: [],
          skipped: [
            {
              recommendationId: "governance_pause",
              title: "Governance pause",
              reason: governance.reasons.join(" "),
            },
          ],
          history: resolved.historyRows.slice(0, 10).map((row) => summarizeRun(row)),
          access: resolved.storyAccess.access,
        },
        { requestId },
      );
    }

    const effectiveMaxActions = Math.min(
      parsedBody.data.maxActions ?? governedPolicy.maxActionsPerCycle,
      governance.constraints.maxActionsCap,
    );
    const selectedItems = selectCreatorEconomyBacklogExecutionItems({
      backlog,
      maxActions: effectiveMaxActions,
    });

    const ownerOverrideMap = createOverrideMap(parsedBody.data.ownerOverrides);

    const executed: Array<{
      recommendationId: string;
      title: string;
      runId: string | null;
      sprintObjective: (typeof ROLE_AGENT_SPRINT_OBJECTIVES)[number];
      horizonDays: number;
      status: "planned" | "dry_run";
    }> = [];

    const skipped = backlog.items
      .filter((item) => item.status !== "ready")
      .map((item) => ({
        recommendationId: item.recommendationId,
        title: item.title,
        reason: item.reason,
      }));

    const createdRuns: Awaited<ReturnType<typeof createStoryCreatorEconomyRun>>[] = [];

    for (const item of selectedItems) {
      const shouldAttachMerchPlan =
        item.execution.requireMerchPlan ||
        item.execution.sprintObjective === "launch_merch_pilot";

      const merchPlan = shouldAttachMerchPlan
        ? buildMerchExperimentPlan({
            report: merchReport,
            candidateId: item.execution.merchCandidateId ?? undefined,
            objective: "validate_demand",
            budgetTier:
              item.execution.sprintObjective === "launch_merch_pilot" ? "medium" : "low",
            durationDays: item.execution.horizonDays,
            channels:
              item.execution.merchChannels.length > 0
                ? item.execution.merchChannels
                : undefined,
          })
        : null;

      const roleBoard = buildCreatorRoleAgentsBoard({
        story: resolved.storyAccess.story,
        collaborators: resolved.collaborators,
        ipReport,
        merchReport,
        merchPlan,
        sprintObjective: item.execution.sprintObjective,
        horizonDays: item.execution.horizonDays,
        ownerOverrides: ownerOverrideMap,
      });

      const operatingPlan = buildCreatorEconomyOperatingPlan({
        story: resolved.storyAccess.story,
        ipReport,
        merchReport,
        roleBoard,
        merchPlan,
        previousMetrics,
      });

      const createdRun = parsedBody.data.persist && !parsedBody.data.dryRun
        ? await createStoryCreatorEconomyRun({
            storyId: resolved.storyAccess.story.id,
            createdByUserId: userId,
            sprintObjective: item.execution.sprintObjective,
            horizonDays: item.execution.horizonDays,
            status: "planned",
            plan: {
              source: "economy_autorun",
              executedRecommendationId: item.recommendationId,
              autonomyMode: parsedBody.data.mode,
              decisionPolicy: governedPolicy,
              operatingPlan,
              roleBoard,
              merchPlan,
            },
            baselineMetrics: operatingPlan.baselineMetrics,
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

    const historyRows =
      createdRuns.length > 0 ? [...createdRuns, ...resolved.historyRows] : resolved.historyRows;

    const refreshedRoleBoard = buildCreatorRoleAgentsBoard({
      story: resolved.storyAccess.story,
      collaborators: resolved.collaborators,
      ipReport,
      merchReport,
      sprintObjective: seedRoleBoard.sprintObjective,
      horizonDays: seedRoleBoard.horizonDays,
      ownerOverrides: ownerOverrideMap,
    });

    const refreshedOperatingPlan = buildCreatorEconomyOperatingPlan({
      story: resolved.storyAccess.story,
      ipReport,
      merchReport,
      roleBoard: refreshedRoleBoard,
      merchPlan: null,
      previousMetrics,
    });

    const refreshedAutomationPlan = buildCreatorEconomyAutomationPlan({
      story: resolved.storyAccess.story,
      operatingPlan: refreshedOperatingPlan,
      roleBoard: refreshedRoleBoard,
      merchReport,
      history: historyRows,
    });

    const refreshedBasePolicy = buildCreatorEconomyDecisionPolicy({
      mode: parsedBody.data.mode,
      automationPlan: refreshedAutomationPlan,
      operatingPlan: refreshedOperatingPlan,
      history: historyRows,
    });
    const refreshedPolicyLearning = buildCreatorEconomyPolicyLearningReport({
      history: historyRows,
    });
    const refreshedPolicy = applyPolicyLearningToDecisionPolicy({
      policy: refreshedBasePolicy,
      learning: refreshedPolicyLearning,
      lockMode: parsedBody.data.mode,
    });

    const refreshedPreliminaryBacklog = buildCreatorEconomyAutonomousBacklog({
      mode: parsedBody.data.mode,
      automationPlan: refreshedAutomationPlan,
      policy: refreshedPolicy,
      history: historyRows,
    });
    const refreshedGovernance = buildCreatorEconomyGovernanceReport({
      history: historyRows,
      learning: refreshedPolicyLearning,
      policy: refreshedPolicy,
      backlog: refreshedPreliminaryBacklog,
    });
    const refreshedGovernedPolicy = applyGovernanceToDecisionPolicy({
      policy: refreshedPolicy,
      governance: refreshedGovernance,
    });
    const refreshedBacklog = buildCreatorEconomyAutonomousBacklog({
      mode: parsedBody.data.mode,
      automationPlan: refreshedAutomationPlan,
      policy: refreshedGovernedPolicy,
      history: historyRows,
    });
    const outcomeAgentPlan = isFeatureEnabled("economy_outcome_agent")
      ? buildCreatorEconomyOutcomeAgentPlan({
          history: historyRows,
          currentMetrics: refreshedOperatingPlan.baselineMetrics,
          learning: refreshedPolicyLearning,
        })
      : null;

    return apiJson(
      {
        mode: parsedBody.data.mode,
        dryRun: parsedBody.data.dryRun,
        blockedByGovernance: false,
        decisionPolicy: refreshedGovernedPolicy,
        policyLearning: refreshedPolicyLearning,
        governance: refreshedGovernance,
        outcomeAgentPlan,
        backlog: refreshedBacklog,
        executed,
        skipped,
        history: historyRows.slice(0, 10).map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-autorun:POST",
      requestId,
      error,
      message: "Failed to execute creator economy autorun cycle",
    });
  }
}
