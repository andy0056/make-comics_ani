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
  setRetentionMissionStatus,
  syncAndGetRetentionMissionsForUser,
} from "@/lib/retention-missions";

const updateMissionStatusSchema = z.object({
  missionId: z.string().uuid(),
  status: z.enum(["open", "completed", "dismissed", "snoozed"]),
});

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("missions")) {
    return apiJson({ missions: [] }, { requestId });
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

    const missions = await syncAndGetRetentionMissionsForUser(userId);
    return apiJson({ missions }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/missions:GET",
      requestId,
      error,
      message: "Failed to fetch missions",
    });
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("missions")) {
    return apiError({
      status: 404,
      error: "Mission feature is disabled",
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

    const parsedBody = updateMissionStatusSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const updatedMission = await setRetentionMissionStatus({
      missionId: parsedBody.data.missionId,
      userId,
      status: parsedBody.data.status,
    });

    if (!updatedMission) {
      return apiError({
        status: 404,
        error: "Mission not found",
        requestId,
      });
    }

    return apiJson({ mission: updatedMission }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/missions:POST",
      requestId,
      error,
      message: "Failed to update mission",
    });
  }
}
