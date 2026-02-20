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
  buildCreatorEconomyOperatingPlan,
  buildCreatorEconomyRunDeltaReport,
  normalizeCreatorEconomyMetrics,
} from "@/lib/creator-economy-orchestrator";
import {
  createStoryCreatorEconomyRun,
  getCharacterDnaProfiles,
  getStoryCharacters,
  getStoryCreatorEconomyRunById,
  getStoryRemixLineage,
  getStoryWorld,
  listStoryCollaborators,
  listStoryCreatorEconomyRuns,
  updateStoryCreatorEconomyRunOutcome,
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
  sprintObjective: z.enum(ROLE_AGENT_SPRINT_OBJECTIVES).default("ship_next_drop"),
  horizonDays: z.number().int().min(3).max(30).default(7),
  ownerOverrides: z
    .array(
      z.object({
        roleId: z.enum(ROLE_AGENT_IDS),
        ownerUserId: z.string().trim().min(1),
      }),
    )
    .max(ROLE_AGENT_IDS.length)
    .optional(),
  merchCandidateId: z.string().trim().min(1).optional(),
  merchChannels: z.array(z.enum(DISTRIBUTION_CHANNELS)).min(1).max(4).optional(),
  persist: z.boolean().optional().default(true),
});

const patchBodySchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["completed", "in_progress"]).optional().default("completed"),
  outcomeDecision: z.enum(["scale", "iterate", "hold", "archive"]).optional(),
  outcomeNotes: z.string().trim().max(2000).optional(),
  metrics: z
    .object({
      combinedScore: z.number().min(0).max(100).optional(),
      ipOverall: z.number().min(0).max(100).optional(),
      retentionPotential: z.number().min(0).max(100).optional(),
      merchSignal: z.number().min(0).max(100).optional(),
      roleCoverage: z.number().min(0).max(100).optional(),
      collaboratorCount: z.number().min(0).optional(),
      remixCount: z.number().min(0).optional(),
      pageCount: z.number().min(0).optional(),
    })
    .partial()
    .optional(),
});

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

  const [world, characters, characterDnaProfiles, remixLineage, collaborators] =
    await Promise.all([
      getStoryWorld(storyAccess.story.id),
      getStoryCharacters(storyAccess.story.id),
      getCharacterDnaProfiles(storyAccess.story.id),
      getStoryRemixLineage(storyAccess.story.id),
      listStoryCollaborators(storyAccess.story.id),
    ]);

  return {
    ok: true as const,
    storyAccess,
    world,
    characters,
    characterDnaProfiles,
    remixLineage,
    collaborators,
  };
}

function createOverrideMap(
  overrides: Array<{ roleId: (typeof ROLE_AGENT_IDS)[number]; ownerUserId: string }> | undefined,
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

function isCreatorEconomyEnabled(): boolean {
  return isFeatureEnabled("creator_economy") && isFeatureEnabled("economy_orchestrator");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy orchestrator is disabled",
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

    const resolved = await resolveStoryContext({ storySlug, userId });
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

    const merchPlan =
      sprintObjective === "launch_merch_pilot"
        ? buildMerchExperimentPlan({
            report: merchReport,
            objective: "validate_demand",
            budgetTier: "medium",
            durationDays: horizonDays,
          })
        : null;

    const historyRows = await listStoryCreatorEconomyRuns({
      storyId: resolved.storyAccess.story.id,
      limit: parsedQuery.data.limit ?? 8,
    });
    const latestRun = historyRows[0] ?? null;
    const previousMetrics = latestRun
      ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics).combinedScore !== undefined
        ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics)
        : normalizeCreatorEconomyMetrics(latestRun.baselineMetrics)
      : {};

    const operatingPlan = buildCreatorEconomyOperatingPlan({
      story: resolved.storyAccess.story,
      ipReport,
      merchReport,
      roleBoard,
      merchPlan,
      previousMetrics,
    });

    return apiJson(
      {
        operatingPlan,
        roleBoard,
        merchPlan,
        history: historyRows.map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-orchestrator:GET",
      requestId,
      error,
      message: "Failed to load creator economy orchestrator",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy orchestrator is disabled",
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

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
      userId,
      unauthorizedMode: "unauthorized",
      requiredPermission: "edit",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    const [world, characters, characterDnaProfiles, remixLineage, collaborators, historyRows] =
      await Promise.all([
        getStoryWorld(storyAccess.story.id),
        getStoryCharacters(storyAccess.story.id),
        getCharacterDnaProfiles(storyAccess.story.id),
        getStoryRemixLineage(storyAccess.story.id),
        listStoryCollaborators(storyAccess.story.id),
        listStoryCreatorEconomyRuns({ storyId: storyAccess.story.id, limit: 8 }),
      ]);

    const ipReport = buildIpIncubatorReport({
      story: storyAccess.story,
      pages: storyAccess.pages,
      world,
      characters,
      characterDnaProfiles,
      remixLineage,
    });

    const merchReport = buildAdvancedMerchabilityDetectorReport({
      story: storyAccess.story,
      pages: storyAccess.pages,
      world,
      characters,
      characterDnaProfiles,
      remixLineage,
    });

    const allowedUserIds = new Set<string>([
      storyAccess.story.userId,
      ...collaborators.map((collaborator) => collaborator.userId),
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

    if (
      parsedBody.data.merchCandidateId &&
      !merchReport.candidates.some(
        (candidate) => candidate.id === parsedBody.data.merchCandidateId,
      )
    ) {
      return apiError({
        status: 400,
        error: "Invalid merch candidate",
        details: { merchCandidateId: parsedBody.data.merchCandidateId },
        requestId,
      });
    }

    const overrideMap = createOverrideMap(parsedBody.data.ownerOverrides);

    const shouldAttachMerchPlan =
      parsedBody.data.sprintObjective === "launch_merch_pilot" ||
      Boolean(parsedBody.data.merchCandidateId);

    const merchPlan = shouldAttachMerchPlan
      ? buildMerchExperimentPlan({
          report: merchReport,
          candidateId: parsedBody.data.merchCandidateId,
          objective: "validate_demand",
          budgetTier:
            parsedBody.data.sprintObjective === "launch_merch_pilot"
              ? "medium"
              : "low",
          durationDays: parsedBody.data.horizonDays,
          channels: parsedBody.data.merchChannels,
        })
      : null;

    const roleBoard = buildCreatorRoleAgentsBoard({
      story: storyAccess.story,
      collaborators,
      ipReport,
      merchReport,
      merchPlan,
      sprintObjective: parsedBody.data.sprintObjective,
      horizonDays: parsedBody.data.horizonDays,
      ownerOverrides: overrideMap,
    });

    const latestRun = historyRows[0] ?? null;
    const previousMetrics = latestRun
      ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics).combinedScore !== undefined
        ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics)
        : normalizeCreatorEconomyMetrics(latestRun.baselineMetrics)
      : {};

    const operatingPlan = buildCreatorEconomyOperatingPlan({
      story: storyAccess.story,
      ipReport,
      merchReport,
      roleBoard,
      merchPlan,
      previousMetrics,
    });

    const createdRun = parsedBody.data.persist
      ? await createStoryCreatorEconomyRun({
          storyId: storyAccess.story.id,
          createdByUserId: userId,
          sprintObjective: parsedBody.data.sprintObjective,
          horizonDays: parsedBody.data.horizonDays,
          status: "planned",
          plan: {
            operatingPlan,
            roleBoard,
            merchPlan,
          },
          baselineMetrics: operatingPlan.baselineMetrics,
        })
      : null;

    const history = createdRun
      ? [summarizeRun(createdRun), ...historyRows.map((row) => summarizeRun(row))]
      : historyRows.map((row) => summarizeRun(row));

    return apiJson(
      {
        operatingPlan,
        roleBoard,
        merchPlan,
        run: createdRun ? summarizeRun(createdRun) : null,
        history,
        access: storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-orchestrator:POST",
      requestId,
      error,
      message: "Failed to build creator economy operating plan",
    });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy orchestrator is disabled",
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

    const parsedBody = patchBodySchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
      userId,
      unauthorizedMode: "unauthorized",
      requiredPermission: "edit",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    const run = await getStoryCreatorEconomyRunById({
      storyId: storyAccess.story.id,
      runId: parsedBody.data.runId,
    });
    if (!run) {
      return apiError({
        status: 404,
        error: "Creator economy run not found",
        requestId,
      });
    }

    const [world, characters, characterDnaProfiles, remixLineage, collaborators] =
      await Promise.all([
        getStoryWorld(storyAccess.story.id),
        getStoryCharacters(storyAccess.story.id),
        getCharacterDnaProfiles(storyAccess.story.id),
        getStoryRemixLineage(storyAccess.story.id),
        listStoryCollaborators(storyAccess.story.id),
      ]);

    const ipReport = buildIpIncubatorReport({
      story: storyAccess.story,
      pages: storyAccess.pages,
      world,
      characters,
      characterDnaProfiles,
      remixLineage,
    });

    const merchReport = buildAdvancedMerchabilityDetectorReport({
      story: storyAccess.story,
      pages: storyAccess.pages,
      world,
      characters,
      characterDnaProfiles,
      remixLineage,
    });

    const roleBoard = buildCreatorRoleAgentsBoard({
      story: storyAccess.story,
      collaborators,
      ipReport,
      merchReport,
      sprintObjective: run.sprintObjective as (typeof ROLE_AGENT_SPRINT_OBJECTIVES)[number],
      horizonDays: run.horizonDays,
    });

    const currentPlan = buildCreatorEconomyOperatingPlan({
      story: storyAccess.story,
      ipReport,
      merchReport,
      roleBoard,
      merchPlan: null,
      previousMetrics: normalizeCreatorEconomyMetrics(run.baselineMetrics),
    });

    const outcomeMetrics = {
      ...currentPlan.baselineMetrics,
      ...(parsedBody.data.metrics ?? {}),
    };

    const updatedRun = await updateStoryCreatorEconomyRunOutcome({
      storyId: storyAccess.story.id,
      runId: run.id,
      outcomeMetrics,
      outcomeDecision: parsedBody.data.outcomeDecision ?? null,
      outcomeNotes: parsedBody.data.outcomeNotes ?? null,
      status: parsedBody.data.status,
    });

    if (!updatedRun) {
      return apiError({
        status: 404,
        error: "Creator economy run not found after update",
        requestId,
      });
    }

    const deltaReport = buildCreatorEconomyRunDeltaReport({
      runId: updatedRun.id,
      status: updatedRun.status,
      baselineMetrics: normalizeCreatorEconomyMetrics(updatedRun.baselineMetrics),
      outcomeMetrics: normalizeCreatorEconomyMetrics(updatedRun.outcomeMetrics),
    });

    return apiJson(
      {
        run: summarizeRun(updatedRun),
        deltaReport,
        access: storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-orchestrator:PATCH",
      requestId,
      error,
      message: "Failed to update creator economy run outcome",
    });
  }
}
