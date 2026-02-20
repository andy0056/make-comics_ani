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
  buildCreatorEconomyAutonomousBacklog,
  buildCreatorEconomyDecisionPolicy,
  CREATOR_ECONOMY_AUTONOMY_MODES,
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
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const querySchema = z.object({
  mode: z.enum(CREATOR_ECONOMY_AUTONOMY_MODES).optional(),
  sprintObjective: z.enum(ROLE_AGENT_SPRINT_OBJECTIVES).optional(),
  horizonDays: z.coerce.number().int().min(3).max(30).optional(),
  limit: z.coerce.number().int().min(1).max(40).optional(),
});

function isCreatorEconomyPolicyLearningEnabled(): boolean {
  return (
    isFeatureEnabled("creator_economy") &&
    isFeatureEnabled("economy_orchestrator") &&
    isFeatureEnabled("economy_automation") &&
    isFeatureEnabled("economy_policy_learning")
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
      listStoryCreatorEconomyRuns({ storyId: storyAccess.story.id, limit: 40 }),
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyPolicyLearningEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy policy learning is disabled",
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

    const sprintObjective = parsedQuery.data.sprintObjective ?? "ship_next_drop";
    const horizonDays = parsedQuery.data.horizonDays ?? 7;
    const mode = parsedQuery.data.mode ?? "assist";

    const roleBoard = buildCreatorRoleAgentsBoard({
      story: resolved.storyAccess.story,
      collaborators: resolved.collaborators,
      ipReport,
      merchReport,
      sprintObjective,
      horizonDays,
    });

    const latestRun = resolved.historyRows[0] ?? null;
    const previousMetrics = latestRun
      ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics).combinedScore !==
        undefined
        ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics)
        : normalizeCreatorEconomyMetrics(latestRun.baselineMetrics)
      : {};

    const operatingPlan = buildCreatorEconomyOperatingPlan({
      story: resolved.storyAccess.story,
      ipReport,
      merchReport,
      roleBoard,
      merchPlan: null,
      previousMetrics,
    });

    const automationPlan = buildCreatorEconomyAutomationPlan({
      story: resolved.storyAccess.story,
      operatingPlan,
      roleBoard,
      merchReport,
      history: resolved.historyRows,
    });

    const basePolicy = buildCreatorEconomyDecisionPolicy({
      mode,
      automationPlan,
      operatingPlan,
      history: resolved.historyRows,
    });
    const learning = buildCreatorEconomyPolicyLearningReport({
      history: resolved.historyRows,
    });
    const decisionPolicy = applyPolicyLearningToDecisionPolicy({
      policy: basePolicy,
      learning,
      lockMode: mode,
    });
    const preliminaryBacklog = buildCreatorEconomyAutonomousBacklog({
      mode,
      automationPlan,
      policy: decisionPolicy,
      history: resolved.historyRows,
    });
    const governance = buildCreatorEconomyGovernanceReport({
      history: resolved.historyRows,
      learning,
      policy: decisionPolicy,
      backlog: preliminaryBacklog,
    });
    const governedPolicy = applyGovernanceToDecisionPolicy({
      policy: decisionPolicy,
      governance,
    });
    const backlog = buildCreatorEconomyAutonomousBacklog({
      mode,
      automationPlan,
      policy: governedPolicy,
      history: resolved.historyRows,
    });

    return apiJson(
      {
        mode,
        learning,
        decisionPolicy: governedPolicy,
        governance,
        backlog,
        history: resolved.historyRows
          .slice(0, parsedQuery.data.limit ?? 12)
          .map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-policy-learning:GET",
      requestId,
      error,
      message: "Failed to load creator economy policy learning data",
    });
  }
}
