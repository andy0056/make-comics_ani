import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { selectMock, eqMock, ascMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  eqMock: vi.fn(() => "eq"),
  ascMock: vi.fn(() => "asc"),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: eqMock,
  asc: ascMock,
}));

vi.mock("@/lib/schema", () => ({
  stories: {
    slug: "slug",
  },
  pages: {
    storyId: "story_id",
    pageNumber: "page_number",
  },
}));

import { GET } from "@/app/api/share/[storySlug]/route";

function makeStorySelectResult(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function makePagesSelectResult(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

describe("api/share/[storySlug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when token is missing", async () => {
    const req = new NextRequest("http://localhost/api/share/story-slug");

    const res = await GET(req, {
      params: Promise.resolve({ storySlug: "story-slug" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Story not found" });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("returns 404 when story is not publicly shared or token mismatches", async () => {
    const req = new NextRequest("http://localhost/api/share/story-slug?token=bad");

    selectMock.mockImplementationOnce(() =>
      makeStorySelectResult([
        {
          id: "story-1",
          title: "Story",
          slug: "story-slug",
          description: null,
          style: "noir",
          isPublicShare: true,
          shareToken: "good-token",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]),
    );

    const res = await GET(req, {
      params: Promise.resolve({ storySlug: "story-slug" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Story not found" });
  });

  it("returns story + pages for valid token", async () => {
    const req = new NextRequest(
      "http://localhost/api/share/story-slug?token=good-token",
    );

    selectMock
      .mockImplementationOnce(() =>
        makeStorySelectResult([
          {
            id: "story-1",
            title: "Story",
            slug: "story-slug",
            description: "desc",
            style: "noir",
            isPublicShare: true,
            shareToken: "good-token",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ]),
      )
      .mockImplementationOnce(() =>
        makePagesSelectResult([
          { pageNumber: 1, generatedImageUrl: "https://img/1" },
          { pageNumber: 2, generatedImageUrl: "https://img/2" },
        ]),
      );

    const res = await GET(req, {
      params: Promise.resolve({ storySlug: "story-slug" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      story: {
        id: "story-1",
        title: "Story",
        slug: "story-slug",
        description: "desc",
        style: "noir",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      pages: [
        { pageNumber: 1, generatedImageUrl: "https://img/1" },
        { pageNumber: 2, generatedImageUrl: "https://img/2" },
      ],
    });
  });
});
