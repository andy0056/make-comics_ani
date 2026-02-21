import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, selectMock, eqMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(() => "eq"),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: eqMock,
}));

vi.mock("@/lib/schema", () => ({
  stories: {
    id: "id",
    title: "title",
    slug: "slug",
    style: "style",
    createdAt: "created_at",
    userId: "user_id",
  },
  pages: {
    storyId: "story_id",
    pageNumber: "page_number",
    generatedImageUrl: "generated_image_url",
    createdAt: "page_created_at",
    updatedAt: "page_updated_at",
  },
}));

import { GET } from "@/app/api/stories/route";

function makeSelectResult(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

describe("api/stories route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ userId: "user-1" });
  });

  it("requires authentication", async () => {
    authMock.mockResolvedValueOnce({ userId: null });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("returns aggregated stories sorted by most recent update", async () => {
    selectMock.mockImplementationOnce(() =>
      makeSelectResult([
        {
          id: "story-a",
          title: "Alpha",
          slug: "alpha",
          style: "noir",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          pageCount: 1,
          coverImage: "https://img/alpha-1",
          pageCreatedAt: new Date("2026-01-02T00:00:00.000Z"),
          pageUpdatedAt: new Date("2026-01-03T00:00:00.000Z"),
        },
        {
          id: "story-a",
          title: "Alpha",
          slug: "alpha",
          style: "noir",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          pageCount: 2,
          coverImage: "https://img/alpha-2",
          pageCreatedAt: new Date("2026-01-04T00:00:00.000Z"),
          pageUpdatedAt: new Date("2026-01-05T00:00:00.000Z"),
        },
        {
          id: "story-b",
          title: "Bravo",
          slug: "bravo",
          style: "manga",
          createdAt: new Date("2026-01-10T00:00:00.000Z"),
          pageCount: 1,
          coverImage: "https://img/bravo-1",
          pageCreatedAt: new Date("2026-01-11T00:00:00.000Z"),
          pageUpdatedAt: new Date("2026-01-12T00:00:00.000Z"),
        },
      ]),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stories: [
        {
          id: "story-b",
          title: "Bravo",
          slug: "bravo",
          style: "manga",
          createdAt: "2026-01-10T00:00:00.000Z",
          pageCount: 1,
          coverImage: "https://img/bravo-1",
          lastUpdated: "2026-01-12T00:00:00.000Z",
        },
        {
          id: "story-a",
          title: "Alpha",
          slug: "alpha",
          style: "noir",
          createdAt: "2026-01-01T00:00:00.000Z",
          pageCount: 2,
          coverImage: "https://img/alpha-1",
          lastUpdated: "2026-01-05T00:00:00.000Z",
        },
      ],
    });
  });

  it("returns 503 for database connectivity failures without leaking details", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    try {
      selectMock.mockImplementation(() => {
        const error = new Error("connection refused while querying stories");
        (error as Error & { code?: string }).code = "ECONNREFUSED";
        throw error;
      });

      const response = await GET();

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error:
          "Database unavailable. Ensure Postgres is running and DATABASE_URL is reachable.",
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("returns generic 500 for non-connectivity failures without leaking details", async () => {
    selectMock.mockImplementation(() => {
      throw new Error("unexpected query failure");
    });

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to fetch stories",
    });
  });
});
