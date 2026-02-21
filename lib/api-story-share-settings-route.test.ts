import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authMock,
  selectMock,
  updateMock,
  updateSetMock,
  updateWhereMock,
  eqMock,
  andMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  selectMock: vi.fn(),
  updateMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  eqMock: vi.fn(() => "eq"),
  andMock: vi.fn(() => "and"),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
    update: updateMock,
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: eqMock,
  and: andMock,
}));

vi.mock("@/lib/schema", () => ({
  stories: {
    id: "id",
    slug: "slug",
    userId: "user_id",
  },
}));

import { GET, POST } from "@/app/api/stories/[storySlug]/share/route";

function buildGetRequest() {
  return new NextRequest("http://localhost/api/stories/story-slug/share", {
    method: "GET",
  });
}

function buildPostRequest(body: string) {
  return new NextRequest("http://localhost/api/stories/story-slug/share", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body,
  });
}

function mockOwnedStory(story: {
  id: string;
  slug: string;
  isPublicShare: boolean;
  shareToken: string | null;
  shareUpdatedAt: Date | null;
} | null) {
  selectMock.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(story ? [story] : []),
      }),
    }),
  });
}

describe("api/stories/[storySlug]/share route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_BASE_URL;

    authMock.mockResolvedValue({ userId: "user-1" });
    updateWhereMock.mockResolvedValue(undefined);
    updateSetMock.mockReturnValue({
      where: updateWhereMock,
    });
    updateMock.mockReturnValue({
      set: updateSetMock,
    });
  });

  it("requires authentication for GET", async () => {
    authMock.mockResolvedValueOnce({ userId: null });

    const response = await GET(buildGetRequest(), {
      params: Promise.resolve({ storySlug: "story-slug" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("rejects invalid storySlug params for GET", async () => {
    const response = await GET(buildGetRequest(), {
      params: Promise.resolve({ storySlug: " ".repeat(200) }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("storySlug"),
    });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("returns existing share settings for owned story", async () => {
    mockOwnedStory({
      id: "story-1",
      slug: "story-slug",
      isPublicShare: true,
      shareToken: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      shareUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await GET(buildGetRequest(), {
      params: Promise.resolve({ storySlug: "story-slug" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      share: {
        isPublicShare: true,
        shareToken: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        shareUpdatedAt: "2026-01-01T00:00:00.000Z",
        shareUrl:
          "http://localhost/story/story-slug/share?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });
  });

  it("rejects unknown POST payload keys", async () => {
    mockOwnedStory({
      id: "story-1",
      slug: "story-slug",
      isPublicShare: false,
      shareToken: null,
      shareUpdatedAt: null,
    });

    const response = await POST(
      buildPostRequest(JSON.stringify({ action: "enable", debug: true })),
      {
        params: Promise.resolve({ storySlug: "story-slug" }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringMatching(/unrecognized|unknown/i),
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("enables sharing with generated token and normalized configured origin", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://www.kaboom.app/editor";
    mockOwnedStory({
      id: "story-1",
      slug: "story-slug",
      isPublicShare: false,
      shareToken: null,
      shareUpdatedAt: null,
    });

    const randomUuidSpy = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("11111111-2222-4333-8444-555555555555");

    try {
      const response = await POST(
        buildPostRequest(JSON.stringify({ action: "enable" })),
        {
          params: Promise.resolve({ storySlug: "story-slug" }),
        },
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.share).toEqual({
        isPublicShare: true,
        shareToken: "11111111222243338444555555555555",
        shareUpdatedAt: expect.any(String),
        shareUrl:
          "https://www.kaboom.app/story/story-slug/share?token=11111111222243338444555555555555",
      });
      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isPublicShare: true,
          shareToken: "11111111222243338444555555555555",
          shareUpdatedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
    } finally {
      randomUuidSpy.mockRestore();
    }
  });

  it("falls back to request origin when configured base URL is invalid", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "javascript:alert(1)";
    mockOwnedStory({
      id: "story-1",
      slug: "story-slug",
      isPublicShare: true,
      shareToken: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      shareUpdatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const response = await GET(buildGetRequest(), {
      params: Promise.resolve({ storySlug: "story-slug" }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.share.shareUrl).toBe(
      "http://localhost/story/story-slug/share?token=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
  });
});
