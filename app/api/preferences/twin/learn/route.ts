import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  getCreatorTwinProfile,
  upsertCreatorTwinProfile,
} from "@/lib/db-actions";
import {
  creatorTwinPreferencesSchema,
  getDefaultCreatorTwinPreferences,
  normalizeCreatorTwinPreferences,
} from "@/lib/creator-twin";
import {
  applyCreatorTwinLearning,
  type CreatorTwinLearningSignal,
} from "@/lib/creator-twin-learning";

const creatorTwinLearnRequestSchema = z.object({
  signalType: z.enum([
    "autopilot_plan_generated",
    "page_generated",
    "queue_completed",
  ]),
  preferences: creatorTwinPreferencesSchema,
  weight: z.number().int().min(1).max(10).optional().default(1),
});

function profileToPreferences(profile: {
  preferredArcPageCount: number;
  preferredDialogueMode: string;
  preferredAudienceMode: string;
}) {
  return normalizeCreatorTwinPreferences({
    pageCount: profile.preferredArcPageCount,
    dialogueMode: profile.preferredDialogueMode,
    audienceMode: profile.preferredAudienceMode,
  });
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("twin")) {
    return apiError({
      status: 404,
      error: "Creator Twin is disabled",
      requestId,
    });
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return apiError({
        status: 401,
        error: "Authentication required",
        requestId,
      });
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return apiError({
        status: 400,
        error: "Invalid JSON body",
        requestId,
      });
    }

    const parsedBody = creatorTwinLearnRequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const profile = await getCreatorTwinProfile(userId);
    const currentPreferences = profile
      ? profileToPreferences(profile)
      : getDefaultCreatorTwinPreferences();

    const learningResult = applyCreatorTwinLearning({
      currentPreferences,
      observedPreferences: parsedBody.data.preferences,
      existingMetadata: profile?.metadata ?? {},
      signalType: parsedBody.data.signalType as CreatorTwinLearningSignal,
      weight: parsedBody.data.weight,
    });

    const updatedProfile = await upsertCreatorTwinProfile(userId, {
      preferredArcPageCount: learningResult.nextPreferences.pageCount,
      preferredDialogueMode: learningResult.nextPreferences.dialogueMode,
      preferredAudienceMode: learningResult.nextPreferences.audienceMode,
      metadata: learningResult.nextMetadata,
    });

    return apiJson(
      {
        preferences: profileToPreferences(updatedProfile),
        learning: {
          signalType: parsedBody.data.signalType,
          samples: learningResult.samples,
          updatedByLearning: learningResult.updatedByLearning,
        },
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/preferences/twin/learn:POST",
      requestId,
      error,
      message: "Failed to process creator learning signal",
    });
  }
}

