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
import {
  buildCreatorEconomyAutomationPlan,
  getCreatorEconomyAutomationRecommendationById,
} from "@/lib/creator-economy-automation";
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
import {
  buildAdvancedMerchabilityDetectorReport,
  buildMerchExperimentPlan,
} from "@/lib/merchability-detector";
import { DISTRIBUTION_CHANNELS } from "@/lib/publishing-distribution";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const querySchema = z.object({
  sprintObjective: z.enum(ROLE_AGENT_SPRINT_OBJECTIVES).optional(),
  horizonDays: z.coerce.number().int().min(3).max(30).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const postBodySchema = z.object({
  recommendationId: z.string().trim().min(1),
  ownerOverrides: z
    .array(
      z.object({
        roleId: z.enum(ROLE_AGENT_IDS),
        ownerUserId: z.string().trim().min(1),
      }),
    )
    .max(ROLE_AGENT_IDS.length)
    .optional(),
  sprintObjective: z.enum(ROLE_AGENT_SPRINT_OBJECTIVES).optional(),
  horizonDays: z.number().int().min(3).max(30).optional(),
  merchCandidateId: z.string().trim().min(1).optional(),
  merchChannels: z.array(z.enum(DISTRIBUTION_CHANNELS)).min(1).max(4).optional(),
  persist: z.boolean().optional().default(true),
});

function isCreatorEconomyAutomationEnabled(): boolean {
  return (
    isFeatureEnabled("creator_economy") &&
    isFeatureEnabled("economy_orchestrator") &&
    isFeatureEnabled("economy_automation")
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
  requiredPermission,
}: {
  storySlug: string;
  userId: string;
  requiredPermission: "view" | "edit";
}) {
  const storyAccess = await getOwnedStoryWithPagesBySlug({
    storySlug,
    userId,
    unauthorizedMode: "unauthorized",
    requiredPermission,
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
      listStoryCreatorEconomyRuns({ storyId: storyAccess.story.id, limit: 10 }),
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
    if (!isCreatorEconomyAutomationEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy automation is disabled",
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
      requiredPermission: "view",
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

    return apiJson(
      {
        automationPlan,
        operatingPlan,
        roleBoard,
        history: resolved.historyRows
          .slice(0, parsedQuery.data.limit ?? 8)
          .map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-automation:GET",
      requestId,
      error,
      message: "Failed to load creator economy automation plan",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyAutomationEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy automation is disabled",
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
      requiredPermission: "edit",
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

    const seedSprintObjective = parsedBody.data.sprintObjective ?? "ship_next_drop";
    const seedHorizonDays = parsedBody.data.horizonDays ?? 7;

    const seedRoleBoard = buildCreatorRoleAgentsBoard({
      story: resolved.storyAccess.story,
      collaborators: resolved.collaborators,
      ipReport,
      merchReport,
      sprintObjective: seedSprintObjective,
      horizonDays: seedHorizonDays,
    });

    const latestRun = resolved.historyRows[0] ?? null;
    const previousMetrics = latestRun
      ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics).combinedScore !==
        undefined
        ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics)
        : normalizeCreatorEconomyMetrics(latestRun.baselineMetrics)
      : {};

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

    const recommendation = getCreatorEconomyAutomationRecommendationById({
      plan: seedAutomationPlan,
      recommendationId: parsedBody.data.recommendationId,
    });

    if (!recommendation) {
      return apiError({
        status: 404,
        error: "Automation recommendation not found",
        requestId,
      });
    }

    const execution = recommendation.execution;

    const merchCandidateId =
      parsedBody.data.merchCandidateId ?? execution.merchCandidateId ?? undefined;
    const merchChannels = parsedBody.data.merchChannels ?? execution.merchChannels;

    if (
      merchCandidateId &&
      !merchReport.candidates.some((candidate) => candidate.id === merchCandidateId)
    ) {
      return apiError({
        status: 400,
        error: "Invalid merch candidate",
        details: { merchCandidateId },
        requestId,
      });
    }

    const shouldAttachMerchPlan =
      execution.requireMerchPlan || execution.sprintObjective === "launch_merch_pilot";

    const merchPlan = shouldAttachMerchPlan
      ? buildMerchExperimentPlan({
          report: merchReport,
          candidateId: merchCandidateId,
          objective: "validate_demand",
          budgetTier: execution.sprintObjective === "launch_merch_pilot" ? "medium" : "low",
          durationDays: execution.horizonDays,
          channels: merchChannels.length > 0 ? merchChannels : undefined,
        })
      : null;

    const roleBoard = buildCreatorRoleAgentsBoard({
      story: resolved.storyAccess.story,
      collaborators: resolved.collaborators,
      ipReport,
      merchReport,
      merchPlan,
      sprintObjective: execution.sprintObjective,
      horizonDays: execution.horizonDays,
      ownerOverrides: createOverrideMap(parsedBody.data.ownerOverrides),
    });

    const operatingPlan = buildCreatorEconomyOperatingPlan({
      story: resolved.storyAccess.story,
      ipReport,
      merchReport,
      roleBoard,
      merchPlan,
      previousMetrics,
    });

    const createdRun = parsedBody.data.persist
      ? await createStoryCreatorEconomyRun({
          storyId: resolved.storyAccess.story.id,
          createdByUserId: userId,
          sprintObjective: execution.sprintObjective,
          horizonDays: execution.horizonDays,
          status: "planned",
          plan: {
            source: "economy_automation",
            recommendation,
            triggerSummary: seedAutomationPlan.triggerSummary,
            operatingPlan,
            roleBoard,
            merchPlan,
          },
          baselineMetrics: operatingPlan.baselineMetrics,
        })
      : null;

    const historyRows = createdRun
      ? [createdRun, ...resolved.historyRows]
      : resolved.historyRows;

    const automationPlan = buildCreatorEconomyAutomationPlan({
      story: resolved.storyAccess.story,
      operatingPlan,
      roleBoard,
      merchReport,
      history: historyRows,
    });

    return apiJson(
      {
        automationPlan,
        executedRecommendation: recommendation,
        execution,
        run: createdRun ? summarizeRun(createdRun) : null,
        operatingPlan,
        roleBoard,
        merchPlan,
        history: historyRows.slice(0, 8).map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-automation:POST",
      requestId,
      error,
      message: "Failed to execute creator economy automation recommendation",
    });
  }
}
