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

const updateCreatorTwinPreferencesSchema = z.object({
  preferences: creatorTwinPreferencesSchema,
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

export async function GET(request: NextRequest) {
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

    const profile = await getCreatorTwinProfile(userId);
    if (!profile) {
      return apiJson(
        {
          preferences: getDefaultCreatorTwinPreferences(),
          source: "default",
        },
        { requestId },
      );
    }

    return apiJson(
      {
        preferences: profileToPreferences(profile),
        source: "server",
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/preferences/twin:GET",
      requestId,
      error,
      message: "Failed to fetch creator preferences",
    });
  }
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

    const parsedBody = updateCreatorTwinPreferencesSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const preferences = parsedBody.data.preferences;
    const profile = await upsertCreatorTwinProfile(userId, {
      preferredArcPageCount: preferences.pageCount,
      preferredDialogueMode: preferences.dialogueMode,
      preferredAudienceMode: preferences.audienceMode,
    });

    return apiJson(
      {
        preferences: profileToPreferences(profile),
        source: "server",
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/preferences/twin:POST",
      requestId,
      error,
      message: "Failed to update creator preferences",
    });
  }
}
