import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authMock,
  getStoryWithPagesBySlugMock,
  deletePageMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getStoryWithPagesBySlugMock: vi.fn(),
  deletePageMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/db-actions", () => ({
  getStoryWithPagesBySlug: getStoryWithPagesBySlugMock,
  deletePage: deletePageMock,
}));

import { DELETE } from "@/app/api/delete-page/route";

const PAGE_ID_1 = "11111111-1111-4111-8111-111111111111";
const PAGE_ID_2 = "22222222-2222-4222-8222-222222222222";

function buildRequest(body: string) {
  return new NextRequest("http://localhost/api/delete-page", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("api/delete-page route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ userId: "user-1" });
    getStoryWithPagesBySlugMock.mockResolvedValue({
      story: { id: "story-1", slug: "story-slug", userId: "user-1" },
      pages: [{ id: PAGE_ID_1 }, { id: PAGE_ID_2 }],
    });
  });

  it("rejects invalid payload", async () => {
    const response = await DELETE(
      buildRequest(
        JSON.stringify({
          storySlug: "story-slug",
          pageId: "not-a-uuid",
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("pageId"),
    });
    expect(getStoryWithPagesBySlugMock).not.toHaveBeenCalled();
    expect(deletePageMock).not.toHaveBeenCalled();
  });

  it("rejects unknown payload keys", async () => {
    const response = await DELETE(
      buildRequest(
        JSON.stringify({
          storySlug: "story-slug",
          pageId: PAGE_ID_1,
          debug: true,
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringMatching(/unrecognized|unknown/i),
    });
    expect(getStoryWithPagesBySlugMock).not.toHaveBeenCalled();
    expect(deletePageMock).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    authMock.mockResolvedValueOnce({ userId: null });

    const response = await DELETE(
      buildRequest(
        JSON.stringify({
          storySlug: "story-slug",
          pageId: PAGE_ID_1,
        }),
      ),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
    expect(getStoryWithPagesBySlugMock).not.toHaveBeenCalled();
    expect(deletePageMock).not.toHaveBeenCalled();
  });

  it("returns 404 when story does not exist", async () => {
    getStoryWithPagesBySlugMock.mockResolvedValueOnce(null);

    const response = await DELETE(
      buildRequest(
        JSON.stringify({
          storySlug: "story-slug",
          pageId: PAGE_ID_1,
        }),
      ),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Story not found" });
    expect(deletePageMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-owner access", async () => {
    getStoryWithPagesBySlugMock.mockResolvedValueOnce({
      story: { id: "story-1", slug: "story-slug", userId: "user-2" },
      pages: [{ id: PAGE_ID_1 }, { id: PAGE_ID_2 }],
    });

    const response = await DELETE(
      buildRequest(
        JSON.stringify({
          storySlug: "story-slug",
          pageId: PAGE_ID_1,
        }),
      ),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(deletePageMock).not.toHaveBeenCalled();
  });

  it("returns 400 when deleting the last page", async () => {
    getStoryWithPagesBySlugMock.mockResolvedValueOnce({
      story: { id: "story-1", slug: "story-slug", userId: "user-1" },
      pages: [{ id: PAGE_ID_1 }],
    });

    const response = await DELETE(
      buildRequest(
        JSON.stringify({
          storySlug: "story-slug",
          pageId: PAGE_ID_1,
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Cannot delete the last page of a story",
    });
    expect(deletePageMock).not.toHaveBeenCalled();
  });

  it("deletes a page when request is valid", async () => {
    const response = await DELETE(
      buildRequest(
        JSON.stringify({
          storySlug: "story-slug",
          pageId: PAGE_ID_1,
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(deletePageMock).toHaveBeenCalledWith(PAGE_ID_1);
  });
});
