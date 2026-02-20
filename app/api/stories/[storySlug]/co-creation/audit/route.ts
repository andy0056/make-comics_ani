import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { listStoryCoCreationAuditEvents } from "@/lib/db-actions";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { formatPresenceUserLabel } from "@/lib/story-coedit";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const querySchema = z.object({
  roomId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(120).default(40),
});

function mapEventLabel(eventType: string): string {
  if (eventType === "room_created") return "Room created";
  if (eventType === "room_archived") return "Room archived";
  if (eventType === "room_owner_transferred") return "Ownership transferred";
  if (eventType === "lock_release_requested") return "Lock release requested";
  if (eventType === "lock_handoff") return "Lock handoff";
  return eventType.replaceAll("_", " ");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    if (!isFeatureEnabled("co_creation_rooms")) {
      return apiError({
        status: 404,
        error: "Co-creation rooms feature is disabled",
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
      roomId: request.nextUrl.searchParams.get("roomId") ?? undefined,
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

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
      userId,
      unauthorizedMode: "unauthorized",
      requiredPermission: "view",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    const events = await listStoryCoCreationAuditEvents({
      storyId: storyAccess.story.id,
      roomId: parsedQuery.data.roomId,
      limit: parsedQuery.data.limit,
    });

    return apiJson(
      {
        events: events.map((event) => ({
          id: event.id,
          storyId: event.storyId,
          roomId: event.roomId,
          actorUserId: event.actorUserId,
          actorUserLabel: formatPresenceUserLabel(event.actorUserId),
          eventType: event.eventType,
          eventLabel: mapEventLabel(event.eventType),
          resource: event.resource,
          targetUserId: event.targetUserId,
          targetUserLabel: event.targetUserId
            ? formatPresenceUserLabel(event.targetUserId)
            : null,
          details: event.details,
          createdAt: event.createdAt.toISOString(),
        })),
        access: storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/co-creation/audit:GET",
      requestId,
      error,
      message: "Failed to load co-creation audit events",
    });
  }
}
