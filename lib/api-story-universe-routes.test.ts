import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getOwnedStoryWithPagesBySlugMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getOwnedStoryWithPagesBySlugMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/story-access", () => ({
  getOwnedStoryWithPagesBySlug: getOwnedStoryWithPagesBySlugMock,
}));

import { GET as getUniverse } from "@/app/api/stories/[storySlug]/universe/route";
import { GET as getUniverseActivity } from "@/app/api/stories/[storySlug]/universe/activity/route";
import { GET as getUniverseInteractive } from "@/app/api/stories/[storySlug]/universe/interactive/route";
import { GET as getCollaborators } from "@/app/api/stories/[storySlug]/collaborators/route";
import { GET as getCoCreationRooms } from "@/app/api/stories/[storySlug]/co-creation/rooms/route";

const validParams = { params: Promise.resolve({ storySlug: "story-slug" }) };
const invalidParams = { params: Promise.resolve({ storySlug: " ".repeat(200) }) };

const accessResultOk = {
  ok: true as const,
  story: {
    id: "story-1",
    slug: "story-slug",
    title: "Neon Requiem",
    style: "noir",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  },
  pages: [],
  access: { isOwner: true, role: "owner", permissions: ["view", "manage"] },
};

const accessResultNotFound = {
  ok: false as const,
  status: 404,
  error: "Story not found",
};

describe("story universe and collaboration routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ userId: "user-1" });
    getOwnedStoryWithPagesBySlugMock.mockResolvedValue(accessResultOk);
  });

  describe("api/stories/[storySlug]/universe", () => {
    it("requires authentication", async () => {
      authMock.mockResolvedValueOnce({ userId: null });

      const response = await getUniverse(new Request("http://localhost"), validParams);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
      expect(getOwnedStoryWithPagesBySlugMock).not.toHaveBeenCalled();
    });

    it("rejects invalid storySlug params", async () => {
      const response = await getUniverse(new Request("http://localhost"), invalidParams);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: expect.stringContaining("storySlug"),
      });
      expect(getOwnedStoryWithPagesBySlugMock).not.toHaveBeenCalled();
    });

    it("returns universe payload for authorized access", async () => {
      const response = await getUniverse(new Request("http://localhost"), validParams);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        universe: {
          currentStoryId: "story-1",
          rootStoryId: "story-1",
          totalStories: 1,
          totalEdges: 0,
          maxDepth: 0,
          nodes: [
            {
              id: "story-1",
              slug: "story-slug",
              title: "Neon Requiem",
              style: "noir",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z",
              parentStoryId: null,
              depth: 0,
              remixCount: 0,
              isCurrent: true,
              isRoot: true,
            },
          ],
          edges: [],
        },
        access: { isOwner: true, role: "owner", permissions: ["view", "manage"] },
      });
    });
  });

  describe("api/stories/[storySlug]/universe/activity", () => {
    it("returns upstream access errors", async () => {
      getOwnedStoryWithPagesBySlugMock.mockResolvedValueOnce(accessResultNotFound);

      const response = await getUniverseActivity(
        new Request("http://localhost"),
        validParams,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Story not found" });
    });

    it("returns activity payload for authorized access", async () => {
      const response = await getUniverseActivity(
        new Request("http://localhost"),
        validParams,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.activity).toEqual({
        generatedAt: expect.any(String),
        eventCount: 0,
        events: [],
        activeBranches: [],
      });
      expect(data.access).toEqual({
        isOwner: true,
        role: "owner",
        permissions: ["view", "manage"],
      });
    });
  });

  describe("api/stories/[storySlug]/universe/interactive", () => {
    it("rejects invalid storySlug params", async () => {
      const response = await getUniverseInteractive(
        new Request("http://localhost"),
        invalidParams,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: expect.stringContaining("storySlug"),
      });
      expect(getOwnedStoryWithPagesBySlugMock).not.toHaveBeenCalled();
    });

    it("returns interactive payload for authorized access", async () => {
      const response = await getUniverseInteractive(
        new Request("http://localhost"),
        validParams,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        interactive: null,
        access: { isOwner: true, role: "owner", permissions: ["view", "manage"] },
      });
    });
  });

  describe("api/stories/[storySlug]/collaborators", () => {
    it("requires authentication", async () => {
      authMock.mockResolvedValueOnce({ userId: null });

      const response = await getCollaborators(
        new Request("http://localhost"),
        validParams,
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
      expect(getOwnedStoryWithPagesBySlugMock).not.toHaveBeenCalled();
    });

    it("returns collaborators payload for authorized access", async () => {
      const response = await getCollaborators(
        new Request("http://localhost"),
        validParams,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        collaborators: [],
        access: { isOwner: true, role: "owner", permissions: ["view", "manage"] },
      });
    });
  });

  describe("api/stories/[storySlug]/co-creation/rooms", () => {
    it("returns upstream access errors", async () => {
      getOwnedStoryWithPagesBySlugMock.mockResolvedValueOnce(accessResultNotFound);

      const response = await getCoCreationRooms(
        new Request("http://localhost"),
        validParams,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Story not found" });
    });

    it("returns rooms payload for authorized access", async () => {
      const response = await getCoCreationRooms(
        new Request("http://localhost"),
        validParams,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        rooms: [],
        access: { isOwner: true, role: "owner", permissions: ["view", "manage"] },
      });
    });
  });
});
