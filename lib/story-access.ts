import {
  getStoryById,
  getStoryCollaborator,
  getStoryWithPagesBySlug,
} from "@/lib/db-actions";
import { type Page, type Story } from "@/lib/schema";

type UnauthorizedMode = "unauthorized" | "not_found";
type RequiredStoryPermission = "view" | "edit" | "manage";
type StoryAccessRole = "owner" | "editor" | "viewer";

type StoryAccessContext = {
  isOwner: boolean;
  role: StoryAccessRole;
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
};

type StoryAccessFailure = {
  ok: false;
  status: 403 | 404;
  error: string;
};

type StoryWithPagesAccessSuccess = {
  ok: true;
  story: Story;
  pages: Page[];
  access: StoryAccessContext;
};

type StoryAccessSuccess = {
  ok: true;
  story: Story;
  access: StoryAccessContext;
};

export type StoryWithPagesAccessResult =
  | StoryWithPagesAccessSuccess
  | StoryAccessFailure;

export type StoryAccessResult = StoryAccessSuccess | StoryAccessFailure;

function unauthorizedFailure(mode: UnauthorizedMode): StoryAccessFailure {
  if (mode === "not_found") {
    return { ok: false, status: 404, error: "Story not found" };
  }

  return { ok: false, status: 403, error: "Unauthorized" };
}

function toAccessContext(role: StoryAccessRole): StoryAccessContext {
  if (role === "owner") {
    return {
      isOwner: true,
      role,
      canView: true,
      canEdit: true,
      canManage: true,
    };
  }

  if (role === "editor") {
    return {
      isOwner: false,
      role,
      canView: true,
      canEdit: true,
      canManage: false,
    };
  }

  return {
    isOwner: false,
    role,
    canView: true,
    canEdit: false,
    canManage: false,
  };
}

function hasRequiredPermission(
  access: StoryAccessContext,
  requiredPermission: RequiredStoryPermission,
): boolean {
  if (requiredPermission === "view") {
    return access.canView;
  }
  if (requiredPermission === "edit") {
    return access.canEdit;
  }
  return access.canManage;
}

export async function getOwnedStoryWithPagesBySlug({
  storySlug,
  userId,
  unauthorizedMode = "unauthorized",
  requiredPermission = "edit",
}: {
  storySlug: string;
  userId: string;
  unauthorizedMode?: UnauthorizedMode;
  requiredPermission?: RequiredStoryPermission;
}): Promise<StoryWithPagesAccessResult> {
  const result = await getStoryWithPagesBySlug(storySlug);
  if (!result) {
    return { ok: false, status: 404, error: "Story not found" };
  }

  let access: StoryAccessContext | null = null;
  if (result.story.userId === userId) {
    access = toAccessContext("owner");
  } else {
    const collaborator = await getStoryCollaborator({
      storyId: result.story.id,
      userId,
    });
    if (!collaborator) {
      return unauthorizedFailure(unauthorizedMode);
    }

    access = toAccessContext(collaborator.role === "viewer" ? "viewer" : "editor");
  }

  if (!hasRequiredPermission(access, requiredPermission)) {
    return unauthorizedFailure(unauthorizedMode);
  }

  return { ok: true, story: result.story, pages: result.pages, access };
}

export async function getOwnedStoryById({
  storyId,
  userId,
  unauthorizedMode = "unauthorized",
  requiredPermission = "edit",
}: {
  storyId: string;
  userId: string;
  unauthorizedMode?: UnauthorizedMode;
  requiredPermission?: RequiredStoryPermission;
}): Promise<StoryAccessResult> {
  const story = await getStoryById(storyId);
  if (!story) {
    return { ok: false, status: 404, error: "Story not found" };
  }

  let access: StoryAccessContext | null = null;
  if (story.userId === userId) {
    access = toAccessContext("owner");
  } else {
    const collaborator = await getStoryCollaborator({
      storyId: story.id,
      userId,
    });
    if (!collaborator) {
      return unauthorizedFailure(unauthorizedMode);
    }

    access = toAccessContext(collaborator.role === "viewer" ? "viewer" : "editor");
  }

  if (!hasRequiredPermission(access, requiredPermission)) {
    return unauthorizedFailure(unauthorizedMode);
  }

  return { ok: true, story, access };
}
