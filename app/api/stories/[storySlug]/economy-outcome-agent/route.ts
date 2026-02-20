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
  buildCreatorEconomyDecisionPolicy,
  CREATOR_ECONOMY_AUTONOMY_MODES,
} from "@/lib/creator-economy-policy";
import {
  buildCreatorEconomyPolicyLearningReport,
  applyPolicyLearningToDecisionPolicy,
} from "@/lib/creator-economy-policy-learning";
import {
  buildCreatorEconomyOutcomeAgentPlan,
  selectCreatorEconomyOutcomeAgentCandidates,
} from "@/lib/creator-economy-outcome-agent";
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
  updateStoryCreatorEconomyRunOutcome,
} from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { buildIpIncubatorReport } from "@/lib/ip-incubator";
import { buildAdvancedMerchabilityDetectorReport } from "@/lib/merchability-detector";
import { type Page, type Story } from "@/lib/schema";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const querySchema = z.object({
  mode: z.enum(CREATOR_ECONOMY_AUTONOMY_MODES).optional(),
  sprintObjective: z.enum(ROLE_AGENT_SPRINT_OBJECTIVES).optional(),
  horizonDays: z.coerce.number().int().min(3).max(30).optional(),
  limit: z.coerce.number().int().min(1).max(40).optional(),
  staleAfterHours: z.coerce.number().int().min(6).max(240).optional(),
  maxRuns: z.coerce.number().int().min(1).max(10).optional(),
});

const postBodySchema = z.object({
  mode: z.enum(CREATOR_ECONOMY_AUTONOMY_MODES).optional().default("assist"),
  sprintObjective: z.enum(ROLE_AGENT_SPRINT_OBJECTIVES).optional(),
  horizonDays: z.number().int().min(3).max(30).optional(),
  staleAfterHours: z.number().int().min(6).max(240).optional().default(18),
  maxRuns: z.number().int().min(1).max(10).optional().default(3),
  dryRun: z.boolean().optional().default(false),
  persist: z.boolean().optional().default(true),
  outcomeNotePrefix: z.string().trim().max(240).optional(),
});

function isCreatorEconomyOutcomeAgentEnabled(): boolean {
  return (
    isFeatureEnabled("creator_economy") &&
    isFeatureEnabled("economy_orchestrator") &&
    isFeatureEnabled("economy_policy_learning") &&
    isFeatureEnabled("economy_outcome_agent")
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

function compactNumericMetrics(
  metrics: Record<string, unknown>,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value;
    }
  }
  return next;
}

async function resolveStoryContext({
  storySlug,
  userId,
  requiredPermission,
  historyLimit = 40,
}: {
  storySlug: string;
  userId: string;
  requiredPermission: "view" | "edit";
  historyLimit?: number;
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
      listStoryCreatorEconomyRuns({ storyId: storyAccess.story.id, limit: historyLimit }),
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

function buildEconomySnapshot({
  story,
  pages,
  world,
  characters,
  characterDnaProfiles,
  remixLineage,
  collaborators,
  historyRows,
  sprintObjective,
  horizonDays,
  mode,
}: {
  story: Story;
  pages: Page[];
  world: Awaited<ReturnType<typeof getStoryWorld>>;
  characters: Awaited<ReturnType<typeof getStoryCharacters>>;
  characterDnaProfiles: Awaited<ReturnType<typeof getCharacterDnaProfiles>>;
  remixLineage: Awaited<ReturnType<typeof getStoryRemixLineage>>;
  collaborators: Awaited<ReturnType<typeof listStoryCollaborators>>;
  historyRows: Awaited<ReturnType<typeof listStoryCreatorEconomyRuns>>;
  sprintObjective: (typeof ROLE_AGENT_SPRINT_OBJECTIVES)[number];
  horizonDays: number;
  mode: (typeof CREATOR_ECONOMY_AUTONOMY_MODES)[number];
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
  const decisionPolicy = applyPolicyLearningToDecisionPolicy({
    policy: basePolicy,
    learning,
    lockMode: mode,
  });

  return {
    learning,
    decisionPolicy,
    operatingPlan,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyOutcomeAgentEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy outcome agent is disabled",
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
      staleAfterHours: request.nextUrl.searchParams.get("staleAfterHours") ?? undefined,
      maxRuns: request.nextUrl.searchParams.get("maxRuns") ?? undefined,
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
      historyLimit: Math.max(parsedQuery.data.limit ?? 20, 20),
    });
    if (!resolved.ok) {
      return apiError({
        status: resolved.status,
        error: resolved.error,
        requestId,
      });
    }

    const sprintObjective = parsedQuery.data.sprintObjective ?? "ship_next_drop";
    const horizonDays = parsedQuery.data.horizonDays ?? 7;
    const mode = parsedQuery.data.mode ?? "assist";
    const staleAfterHours = parsedQuery.data.staleAfterHours ?? 18;
    const maxRuns = parsedQuery.data.maxRuns ?? 3;

    const snapshot = buildEconomySnapshot({
      story: resolved.storyAccess.story,
      pages: resolved.storyAccess.pages,
      world: resolved.world,
      characters: resolved.characters,
      characterDnaProfiles: resolved.characterDnaProfiles,
      remixLineage: resolved.remixLineage,
      collaborators: resolved.collaborators,
      historyRows: resolved.historyRows,
      sprintObjective,
      horizonDays,
      mode,
    });

    const plan = buildCreatorEconomyOutcomeAgentPlan({
      history: resolved.historyRows,
      currentMetrics: snapshot.operatingPlan.baselineMetrics,
      learning: snapshot.learning,
      staleAfterHours,
    });
    const selectedCandidates = selectCreatorEconomyOutcomeAgentCandidates({
      plan,
      maxRuns,
    });

    return apiJson(
      {
        mode,
        staleAfterHours,
        maxRuns,
        learning: snapshot.learning,
        decisionPolicy: snapshot.decisionPolicy,
        plan,
        selectedCandidates,
        history: resolved.historyRows
          .slice(0, parsedQuery.data.limit ?? 12)
          .map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-outcome-agent:GET",
      requestId,
      error,
      message: "Failed to build creator economy outcome-agent plan",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isCreatorEconomyOutcomeAgentEnabled()) {
      return apiError({
        status: 404,
        error: "Creator economy outcome agent is disabled",
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
      historyLimit: 40,
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
    const mode = parsedBody.data.mode;

    const snapshot = buildEconomySnapshot({
      story: resolved.storyAccess.story,
      pages: resolved.storyAccess.pages,
      world: resolved.world,
      characters: resolved.characters,
      characterDnaProfiles: resolved.characterDnaProfiles,
      remixLineage: resolved.remixLineage,
      collaborators: resolved.collaborators,
      historyRows: resolved.historyRows,
      sprintObjective,
      horizonDays,
      mode,
    });

    const plan = buildCreatorEconomyOutcomeAgentPlan({
      history: resolved.historyRows,
      currentMetrics: snapshot.operatingPlan.baselineMetrics,
      learning: snapshot.learning,
      staleAfterHours: parsedBody.data.staleAfterHours,
    });
    const selectedCandidates = selectCreatorEconomyOutcomeAgentCandidates({
      plan,
      maxRuns: parsedBody.data.maxRuns,
    });

    const shouldPersist = parsedBody.data.persist && !parsedBody.data.dryRun;
    const closedRuns: Array<{
      runId: string;
      decision: "scale" | "iterate" | "hold" | "archive";
      status: "completed" | "dry_run";
      note: string;
    }> = [];

    if (shouldPersist) {
      for (const candidate of selectedCandidates) {
        const prefixedNote = parsedBody.data.outcomeNotePrefix
          ? `${parsedBody.data.outcomeNotePrefix.trim()} ${candidate.suggestedOutcomeNotes}`.trim()
          : candidate.suggestedOutcomeNotes;
        const updatedRun = await updateStoryCreatorEconomyRunOutcome({
          storyId: resolved.storyAccess.story.id,
          runId: candidate.runId,
          outcomeDecision: candidate.suggestedOutcomeDecision,
          outcomeNotes: prefixedNote,
          outcomeMetrics: compactNumericMetrics(
            candidate.suggestedOutcomeMetrics as Record<string, unknown>,
          ),
          status: "completed",
        });
        if (updatedRun) {
          closedRuns.push({
            runId: updatedRun.id,
            decision: candidate.suggestedOutcomeDecision,
            status: "completed",
            note: prefixedNote,
          });
        }
      }
    } else {
      for (const candidate of selectedCandidates) {
        const prefixedNote = parsedBody.data.outcomeNotePrefix
          ? `${parsedBody.data.outcomeNotePrefix.trim()} ${candidate.suggestedOutcomeNotes}`.trim()
          : candidate.suggestedOutcomeNotes;
        closedRuns.push({
          runId: candidate.runId,
          decision: candidate.suggestedOutcomeDecision,
          status: "dry_run",
          note: prefixedNote,
        });
      }
    }

    const historyRows = shouldPersist
      ? await listStoryCreatorEconomyRuns({
          storyId: resolved.storyAccess.story.id,
          limit: 40,
        })
      : resolved.historyRows;

    const refreshedSnapshot = buildEconomySnapshot({
      story: resolved.storyAccess.story,
      pages: resolved.storyAccess.pages,
      world: resolved.world,
      characters: resolved.characters,
      characterDnaProfiles: resolved.characterDnaProfiles,
      remixLineage: resolved.remixLineage,
      collaborators: resolved.collaborators,
      historyRows,
      sprintObjective,
      horizonDays,
      mode,
    });

    const refreshedPlan = buildCreatorEconomyOutcomeAgentPlan({
      history: historyRows,
      currentMetrics: refreshedSnapshot.operatingPlan.baselineMetrics,
      learning: refreshedSnapshot.learning,
      staleAfterHours: parsedBody.data.staleAfterHours,
    });

    return apiJson(
      {
        mode,
        dryRun: !shouldPersist,
        staleAfterHours: parsedBody.data.staleAfterHours,
        maxRuns: parsedBody.data.maxRuns,
        learning: refreshedSnapshot.learning,
        decisionPolicy: refreshedSnapshot.decisionPolicy,
        plan: refreshedPlan,
        selectedCandidates,
        closedRuns,
        history: historyRows.slice(0, 12).map((row) => summarizeRun(row)),
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/economy-outcome-agent:POST",
      requestId,
      error,
      message: "Failed to execute creator economy outcome-agent cycle",
    });
  }
}
