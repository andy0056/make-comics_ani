import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authMock,
  getOwnedStoryWithPagesBySlugMock,
  updateStoryMock,
  deleteStoryMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getOwnedStoryWithPagesBySlugMock: vi.fn(),
  updateStoryMock: vi.fn(),
  deleteStoryMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/story-access", () => ({
  getOwnedStoryWithPagesBySlug: getOwnedStoryWithPagesBySlugMock,
}));

vi.mock("@/lib/db-actions", () => ({
  updateStory: updateStoryMock,
  deleteStory: deleteStoryMock,
}));

import { GET, PUT } from "@/app/api/stories/[storySlug]/route";

function buildRequest(body: string) {
  return new NextRequest("http://localhost/api/stories/story-slug", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body,
  });
}

describe("api/stories/[storySlug] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ userId: "user-1" });
    getOwnedStoryWithPagesBySlugMock.mockResolvedValue({
      ok: true,
      story: { id: "story-1" },
      pages: [],
      access: { isOwner: true },
    });
  });

  it("rejects invalid storySlug params for GET", async () => {
    const response = await GET(new NextRequest("http://localhost/api/stories/x"), {
      params: Promise.resolve({ storySlug: " ".repeat(200) }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("storySlug"),
    });
    expect(getOwnedStoryWithPagesBySlugMock).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON payload", async () => {
    const response = await PUT(buildRequest("{"), {
      params: Promise.resolve({ storySlug: "story-slug" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(updateStoryMock).not.toHaveBeenCalled();
  });

  it("rejects invalid title payload", async () => {
    const response = await PUT(
      buildRequest(JSON.stringify({ title: " ".repeat(4) })),
      {
        params: Promise.resolve({ storySlug: "story-slug" }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("title"),
    });
    expect(updateStoryMock).not.toHaveBeenCalled();
  });

  it("rejects unknown title payload keys", async () => {
    const response = await PUT(
      buildRequest(JSON.stringify({ title: "New Title", debug: true })),
      {
        params: Promise.resolve({ storySlug: "story-slug" }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringMatching(/unrecognized|unknown/i),
    });
    expect(updateStoryMock).not.toHaveBeenCalled();
  });

  it("trims title before update", async () => {
    const response = await PUT(
      buildRequest(JSON.stringify({ title: "  New Title  " })),
      {
        params: Promise.resolve({ storySlug: "story-slug" }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(updateStoryMock).toHaveBeenCalledWith("story-1", { title: "New Title" });
  });
});
