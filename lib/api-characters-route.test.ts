import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authMock,
  getOwnedStoryWithPagesBySlugMock,
  dbDeleteMock,
  dbDeleteWhereMock,
  dbInsertMock,
  dbInsertValuesMock,
  eqMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getOwnedStoryWithPagesBySlugMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  dbDeleteWhereMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbInsertValuesMock: vi.fn(),
  eqMock: vi.fn(() => "eq"),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/story-access", () => ({
  getOwnedStoryWithPagesBySlug: getOwnedStoryWithPagesBySlugMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    delete: dbDeleteMock,
    insert: dbInsertMock,
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: eqMock,
}));

vi.mock("@/lib/schema", () => ({
  storyCharacters: {
    storyId: "story_id",
    sortOrder: "sort_order",
  },
}));

import { PUT } from "@/app/api/stories/[storySlug]/characters/route";

function buildRequest(body: string) {
  return new NextRequest("http://localhost/api/stories/story-slug/characters", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body,
  });
}

describe("api/stories/[storySlug]/characters route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ userId: "user-1" });
    getOwnedStoryWithPagesBySlugMock.mockResolvedValue({
      ok: true,
      story: { id: "story-1" },
      pages: [],
      access: { isOwner: true },
    });

    dbDeleteMock.mockReturnValue({
      where: dbDeleteWhereMock.mockResolvedValue(undefined),
    });

    dbInsertMock.mockReturnValue({
      values: dbInsertValuesMock.mockResolvedValue(undefined),
    });
  });

  it("rejects invalid payload without mutating existing characters", async () => {
    const response = await PUT(buildRequest(JSON.stringify({ characters: "bad" })), {
      params: Promise.resolve({ storySlug: "story-slug" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("characters"),
    });
    expect(dbDeleteMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("rejects unknown character fields without mutating existing characters", async () => {
    const response = await PUT(
      buildRequest(
        JSON.stringify({
          characters: [
            {
              name: "Hero",
              role: "Protagonist",
              powerLevel: "over-9000",
            },
          ],
        }),
      ),
      {
        params: Promise.resolve({ storySlug: "story-slug" }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringMatching(/unrecognized|unknown/i),
    });
    expect(dbDeleteMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("persists normalized characters for valid payload", async () => {
    const response = await PUT(
      buildRequest(
        JSON.stringify({
          characters: [
            {
              name: "  Hero  ",
              role: "  Protagonist ",
              appearance: " Tall ",
              personality: " Calm ",
              speechStyle: " Direct ",
              referenceImageUrl: " https://example.com/hero.png ",
              isLocked: true,
            },
          ],
        }),
      ),
      {
        params: Promise.resolve({ storySlug: "story-slug" }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      characters: [
        {
          name: "Hero",
          role: "Protagonist",
          appearance: "Tall",
          personality: "Calm",
          speechStyle: "Direct",
          referenceImageUrl: "https://example.com/hero.png",
          isLocked: true,
        },
      ],
    });
    expect(dbDeleteMock).toHaveBeenCalledTimes(1);
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
    expect(dbInsertValuesMock).toHaveBeenCalledTimes(1);
  });
});
