import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import { buildCoEditConflictResolution } from "@/lib/coedit-conflict-resolution";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";
import {
  acquireStoryEditLock,
  getCharacterDnaProfiles,
  getStoryCharacters,
  releaseStoryEditLock,
  replaceCharacterDnaProfiles,
} from "@/lib/db-actions";
import { formatPresenceUserLabel, STORY_EDIT_RESOURCE } from "@/lib/story-coedit";

const dnaProfileSchema = z.object({
  characterId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  visualTraits: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  behaviorTraits: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  speechTraits: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  lockedFields: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

const updateDnaRequestSchema = z.object({
  profiles: z.array(dnaProfileSchema).max(20),
});

function splitTraits(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[;,]/)
    .map((trait) => trait.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  if (!isFeatureEnabled("canon_core")) {
    return apiError({
      status: 404,
      error: "Character DNA feature is disabled",
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

    const [profiles, characters] = await Promise.all([
      getCharacterDnaProfiles(storyAccess.story.id),
      getStoryCharacters(storyAccess.story.id),
    ]);

    const profileMap = new Map(
      profiles.map((profile) => [profile.characterId, profile]),
    );
    const normalizedProfiles = characters.map((character) => {
      const existing = profileMap.get(character.id);
      if (existing) {
        return existing;
      }

      return {
        id: `seed-${character.id}`,
        storyId: storyAccess.story.id,
        characterId: character.id,
        name: character.name,
        visualTraits: splitTraits(character.appearance),
        behaviorTraits: splitTraits(character.personality),
        speechTraits: splitTraits(character.speechStyle),
        lockedFields: character.isLocked
          ? ["appearance", "behavior", "speech"]
          : [],
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
      };
    });

    return apiJson({ profiles: normalizedProfiles }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/characters/dna:GET",
      requestId,
      error,
      message: "Failed to fetch character DNA profiles",
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

  if (!isFeatureEnabled("canon_core")) {
    return apiError({
      status: 404,
      error: "Character DNA feature is disabled",
      requestId,
    });
  }

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
      ttlSeconds: 180,
      reason: "character-dna-update",
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
        error: `Character DNA is currently locked by ${formatPresenceUserLabel(lockResult.conflict.userId)}. Try again shortly.`,
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

    const parsed = updateDnaRequestSchema.safeParse(requestBody);
    if (!parsed.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsed.error.flatten(),
        requestId,
      });
    }

    const storyCharacters = await getStoryCharacters(storyAccess.story.id);
    const validCharacterIds = new Set(storyCharacters.map((character) => character.id));
    const hasInvalidCharacter = parsed.data.profiles.some(
      (profile) => !validCharacterIds.has(profile.characterId),
    );

    if (hasInvalidCharacter) {
      return apiError({
        status: 400,
        error: "One or more characterId values are invalid for this story",
        requestId,
      });
    }

    const profiles = await replaceCharacterDnaProfiles(
      storyAccess.story.id,
      parsed.data.profiles,
    );
    return apiJson({ profiles }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/characters/dna:PUT",
      requestId,
      error,
      message: "Failed to update character DNA profiles",
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
