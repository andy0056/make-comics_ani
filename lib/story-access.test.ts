import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Page, type Story } from "@/lib/schema";

vi.mock("@/lib/db-actions", () => ({
  getStoryById: vi.fn(),
  getStoryCollaborator: vi.fn(),
  getStoryWithPagesBySlug: vi.fn(),
}));

import {
  getStoryById,
  getStoryCollaborator,
  getStoryWithPagesBySlug,
} from "@/lib/db-actions";
import {
  getOwnedStoryById,
  getOwnedStoryWithPagesBySlug,
} from "@/lib/story-access";

const mockedGetStoryById = vi.mocked(getStoryById);
const mockedGetStoryCollaborator = vi.mocked(getStoryCollaborator);
const mockedGetStoryWithPagesBySlug = vi.mocked(getStoryWithPagesBySlug);

function createStory(userId: string): Story {
  return {
    id: "story-1",
    title: "Story",
    slug: "story-slug",
    description: null,
    style: "noir",
    userId,
    usesOwnApiKey: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function createPage(storyId: string): Page {
  return {
    id: "page-1",
    storyId,
    pageNumber: 1,
    prompt: "hello",
    characterImageUrls: [],
    generatedImageUrl: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("story-access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetStoryCollaborator.mockResolvedValue(null);
  });

  it("returns 404 when story slug is missing", async () => {
    mockedGetStoryWithPagesBySlug.mockResolvedValueOnce(null);

    const result = await getOwnedStoryWithPagesBySlug({
      storySlug: "missing",
      userId: "user-1",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Story not found",
    });
  });

  it("returns 403 for unauthorized story slug access by default", async () => {
    mockedGetStoryWithPagesBySlug.mockResolvedValueOnce({
      story: createStory("owner"),
      pages: [createPage("story-1")],
    });

    const result = await getOwnedStoryWithPagesBySlug({
      storySlug: "story-slug",
      userId: "another-user",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Unauthorized",
    });
  });

  it("returns 404 for unauthorized story slug access in not_found mode", async () => {
    mockedGetStoryWithPagesBySlug.mockResolvedValueOnce({
      story: createStory("owner"),
      pages: [createPage("story-1")],
    });

    const result = await getOwnedStoryWithPagesBySlug({
      storySlug: "story-slug",
      userId: "another-user",
      unauthorizedMode: "not_found",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Story not found",
    });
  });

  it("returns story with pages for authorized story slug access", async () => {
    const story = createStory("user-1");
    const pages = [createPage("story-1")];
    mockedGetStoryWithPagesBySlug.mockResolvedValueOnce({
      story,
      pages,
    });

    const result = await getOwnedStoryWithPagesBySlug({
      storySlug: story.slug,
      userId: "user-1",
    });

    expect(result).toEqual({
      ok: true,
      story,
      pages,
      access: {
        isOwner: true,
        role: "owner",
        canView: true,
        canEdit: true,
        canManage: true,
      },
    });
  });

  it("returns story with pages for collaborator with edit role", async () => {
    const story = createStory("owner");
    const pages = [createPage("story-1")];
    mockedGetStoryWithPagesBySlug.mockResolvedValueOnce({ story, pages });
    mockedGetStoryCollaborator.mockResolvedValueOnce({
      id: "collab-1",
      storyId: story.id,
      userId: "editor-user",
      role: "editor",
      invitedByUserId: "owner",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await getOwnedStoryWithPagesBySlug({
      storySlug: story.slug,
      userId: "editor-user",
    });

    expect(result).toEqual({
      ok: true,
      story,
      pages,
      access: {
        isOwner: false,
        role: "editor",
        canView: true,
        canEdit: true,
        canManage: false,
      },
    });
  });

  it("blocks viewer collaborators from edit-only access", async () => {
    const story = createStory("owner");
    const pages = [createPage("story-1")];
    mockedGetStoryWithPagesBySlug.mockResolvedValueOnce({ story, pages });
    mockedGetStoryCollaborator.mockResolvedValueOnce({
      id: "collab-1",
      storyId: story.id,
      userId: "viewer-user",
      role: "viewer",
      invitedByUserId: "owner",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await getOwnedStoryWithPagesBySlug({
      storySlug: story.slug,
      userId: "viewer-user",
      requiredPermission: "edit",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Unauthorized",
    });
  });

  it("allows viewer collaborators for view access", async () => {
    const story = createStory("owner");
    const pages = [createPage("story-1")];
    mockedGetStoryWithPagesBySlug.mockResolvedValueOnce({ story, pages });
    mockedGetStoryCollaborator.mockResolvedValueOnce({
      id: "collab-1",
      storyId: story.id,
      userId: "viewer-user",
      role: "viewer",
      invitedByUserId: "owner",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await getOwnedStoryWithPagesBySlug({
      storySlug: story.slug,
      userId: "viewer-user",
      requiredPermission: "view",
    });

    expect(result).toEqual({
      ok: true,
      story,
      pages,
      access: {
        isOwner: false,
        role: "viewer",
        canView: true,
        canEdit: false,
        canManage: false,
      },
    });
  });

  it("returns 404 when story id is missing", async () => {
    mockedGetStoryById.mockResolvedValueOnce(null);

    const result = await getOwnedStoryById({
      storyId: "missing",
      userId: "user-1",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Story not found",
    });
  });

  it("returns story for authorized story id access", async () => {
    const story = createStory("user-1");
    mockedGetStoryById.mockResolvedValueOnce(story);

    const result = await getOwnedStoryById({
      storyId: story.id,
      userId: "user-1",
    });

    expect(result).toEqual({
      ok: true,
      story,
      access: {
        isOwner: true,
        role: "owner",
        canView: true,
        canEdit: true,
        canManage: true,
      },
    });
  });

  it("returns 404 for collaborator without required manage permission in not_found mode", async () => {
    const story = createStory("owner");
    mockedGetStoryById.mockResolvedValueOnce(story);
    mockedGetStoryCollaborator.mockResolvedValueOnce({
      id: "collab-1",
      storyId: story.id,
      userId: "editor-user",
      role: "editor",
      invitedByUserId: "owner",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await getOwnedStoryById({
      storyId: story.id,
      userId: "editor-user",
      requiredPermission: "manage",
      unauthorizedMode: "not_found",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Story not found",
    });
  });
});
