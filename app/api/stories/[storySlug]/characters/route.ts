import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  acquireStoryEditLock,
  getStoryCharacters,
  releaseStoryEditLock,
  replaceStoryCharacters,
} from "@/lib/db-actions";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { buildCoEditConflictResolution } from "@/lib/coedit-conflict-resolution";
import { formatPresenceUserLabel, STORY_EDIT_RESOURCE } from "@/lib/story-coedit";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const storyCharacterSchema = z.object({
  name: z.string().trim().min(1, "Character name is required"),
  role: z.string().trim().optional().default(""),
  appearance: z.string().trim().optional().default(""),
  personality: z.string().trim().optional().default(""),
  speechStyle: z.string().trim().optional().default(""),
  referenceImageUrl: z.string().trim().optional().default(""),
  isLocked: z.boolean().optional().default(true),
});

const updateStoryCharactersSchema = z.object({
  characters: z.array(storyCharacterSchema).max(6, "Maximum 6 characters"),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);
  try {
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

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
      userId,
      unauthorizedMode: "unauthorized",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    const characters = await getStoryCharacters(storyAccess.story.id);
    return apiJson({ characters }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/characters:GET",
      requestId,
      error,
      message: "Failed to fetch story characters",
    });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);
  let authenticatedUserId: string | null = null;
  let lockedStoryId: string | null = null;
  let shouldReleaseLock = false;
  try {
    const { userId } = await auth();
    authenticatedUserId = userId;
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

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
      userId,
      unauthorizedMode: "unauthorized",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    const lockResult = await acquireStoryEditLock({
      storyId: storyAccess.story.id,
      resource: STORY_EDIT_RESOURCE.characterBible,
      userId,
      ttlSeconds: 150,
      reason: "character-bible-update",
    });
    if (!lockResult.acquired) {
      const resolution = await buildCoEditConflictResolution({
        storyId: storyAccess.story.id,
        lockedByUserId: lockResult.conflict.userId,
        requestingUserId: userId,
        expiresAt: lockResult.conflict.expiresAt,
      });
      return apiError({
        status: 409,
        error: `Character bible is currently locked by ${formatPresenceUserLabel(lockResult.conflict.userId)}. Try again shortly.`,
        details: {
          resource: STORY_EDIT_RESOURCE.characterBible,
          lockedByUserId: lockResult.conflict.userId,
          lockedByUserLabel: formatPresenceUserLabel(lockResult.conflict.userId),
          expiresAt: lockResult.conflict.expiresAt,
          resolution,
        },
        requestId,
      });
    }
    lockedStoryId = storyAccess.story.id;
    shouldReleaseLock = true;

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

    const parsed = updateStoryCharactersSchema.safeParse(requestBody);
    if (!parsed.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsed.error.flatten(),
        requestId,
      });
    }

    const characters = await replaceStoryCharacters(
      storyAccess.story.id,
      parsed.data.characters.map((character, index) => ({
        ...character,
        sortOrder: index,
      })),
    );

    return apiJson({ characters }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/characters:PUT",
      requestId,
      error,
      message: "Failed to update story characters",
    });
  } finally {
    if (shouldReleaseLock && lockedStoryId && authenticatedUserId) {
      await releaseStoryEditLock({
        storyId: lockedStoryId,
        resource: STORY_EDIT_RESOURCE.characterBible,
        userId: authenticatedUserId,
      }).catch(() => undefined);
    }
  }
}
