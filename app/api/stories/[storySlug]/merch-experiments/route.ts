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
  getCharacterDnaProfiles,
  getStoryCharacters,
  getStoryRemixLineage,
  getStoryWorld,
} from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  buildAdvancedMerchabilityDetectorReport,
  buildMerchExperimentPlan,
} from "@/lib/merchability-detector";
import { DISTRIBUTION_CHANNELS } from "@/lib/publishing-distribution";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const postBodySchema = z.object({
  candidateId: z.string().trim().min(1).optional(),
  objective: z
    .enum(["validate_demand", "collect_feedback", "preorder_signal"])
    .default("validate_demand"),
  budgetTier: z.enum(["low", "medium", "high"]).default("low"),
  durationDays: z.number().int().min(3).max(30).default(7),
  channels: z.array(z.enum(DISTRIBUTION_CHANNELS)).min(1).max(4).optional(),
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

  const [world, characters, characterDnaProfiles, remixLineage] =
    await Promise.all([
      getStoryWorld(storyAccess.story.id),
      getStoryCharacters(storyAccess.story.id),
      getCharacterDnaProfiles(storyAccess.story.id),
      getStoryRemixLineage(storyAccess.story.id),
    ]);

  return {
    ok: true as const,
    storyAccess,
    world,
    characters,
    characterDnaProfiles,
    remixLineage,
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

    const resolved = await resolveStoryContext({ storySlug, userId });
    if (!resolved.ok) {
      return apiError({
        status: resolved.status,
        error: resolved.error,
        requestId,
      });
    }

    const report = buildAdvancedMerchabilityDetectorReport({
      story: resolved.storyAccess.story,
      pages: resolved.storyAccess.pages,
      world: resolved.world,
      characters: resolved.characters,
      characterDnaProfiles: resolved.characterDnaProfiles,
      remixLineage: resolved.remixLineage,
    });

    return apiJson(
      {
        report,
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/merch-experiments:GET",
      requestId,
      error,
      message: "Failed to build merchability report",
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

    const report = buildAdvancedMerchabilityDetectorReport({
      story: resolved.storyAccess.story,
      pages: resolved.storyAccess.pages,
      world: resolved.world,
      characters: resolved.characters,
      characterDnaProfiles: resolved.characterDnaProfiles,
      remixLineage: resolved.remixLineage,
    });

    const selectedCandidateId = parsedBody.data.candidateId;
    if (
      selectedCandidateId &&
      !report.candidates.some((candidate) => candidate.id === selectedCandidateId)
    ) {
      return apiError({
        status: 400,
        error: "Invalid merch experiment candidate",
        details: {
          candidateId: selectedCandidateId,
        },
        requestId,
      });
    }

    const plan = buildMerchExperimentPlan({
      report,
      candidateId: selectedCandidateId,
      objective: parsedBody.data.objective,
      budgetTier: parsedBody.data.budgetTier,
      durationDays: parsedBody.data.durationDays,
      channels: parsedBody.data.channels,
    });

    return apiJson(
      {
        report,
        plan,
        access: resolved.storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/merch-experiments:POST",
      requestId,
      error,
      message: "Failed to build merch experiment plan",
    });
  }
}
