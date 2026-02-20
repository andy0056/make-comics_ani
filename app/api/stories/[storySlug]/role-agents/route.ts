import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { buildCreatorRoleAgentsBoard, ROLE_AGENT_IDS, ROLE_AGENT_SPRINT_OBJECTIVES } from "@/lib/collaborative-role-agents";
import {
  getCharacterDnaProfiles,
  getStoryCharacters,
  getStoryRemixLineage,
  getStoryWorld,
  listStoryCollaborators,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isFeatureEnabled("creator_economy")) {
      return apiError({
        status: 404,
        error: "Creator economy layer is disabled",
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

    const board = buildCreatorRoleAgentsBoard({
      story: resolved.storyAccess.story,
      collaborators: resolved.collaborators,
      ipReport,
      merchReport,
      sprintObjective: parsedQuery.data.sprintObjective ?? "ship_next_drop",
      horizonDays: parsedQuery.data.horizonDays ?? 7,
    });

    return apiJson(
      {
        board,
        ipReport,
        merchReport,
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/role-agents:GET",
      requestId,
      error,
      message: "Failed to load role agents board",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isFeatureEnabled("creator_economy")) {
      return apiError({
        status: 404,
        error: "Creator economy layer is disabled",
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

    const allowedUserIds = new Set<string>([
      resolved.storyAccess.story.userId,
      ...resolved.collaborators.map((collaborator) => collaborator.userId),
    ]);

    const ownerOverrides: Partial<Record<(typeof ROLE_AGENT_IDS)[number], string>> =
      {};
    for (const override of parsedBody.data.ownerOverrides ?? []) {
      if (!allowedUserIds.has(override.ownerUserId)) {
        return apiError({
          status: 400,
          error: "Invalid owner override user",
          details: override,
          requestId,
        });
      }
      ownerOverrides[override.roleId] = override.ownerUserId;
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

    const board = buildCreatorRoleAgentsBoard({
      story: resolved.storyAccess.story,
      collaborators: resolved.collaborators,
      ipReport,
      merchReport,
      merchPlan,
      sprintObjective: parsedBody.data.sprintObjective,
      horizonDays: parsedBody.data.horizonDays,
      ownerOverrides,
    });

    return apiJson(
      {
        board,
        ipReport,
        merchReport,
        merchPlan,
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/role-agents:POST",
      requestId,
      error,
      message: "Failed to build role agents plan",
    });
  }
}
