import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, getStoryWithPagesBySlugMock, jsPdfConstructorMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    getStoryWithPagesBySlugMock: vi.fn(),
    jsPdfConstructorMock: vi.fn(),
  }),
);

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/db-actions", () => ({
  getStoryWithPagesBySlug: getStoryWithPagesBySlugMock,
}));

vi.mock("jspdf", () => ({
  jsPDF: jsPdfConstructorMock,
}));

import { GET } from "@/app/api/download-pdf/route";

function buildRequest(storySlug: string) {
  return new NextRequest(
    `http://localhost/api/download-pdf?storySlug=${encodeURIComponent(storySlug)}`,
  );
}

describe("api/download-pdf route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ userId: "user-1" });
    getStoryWithPagesBySlugMock.mockResolvedValue({
      story: {
        id: "story-1",
        userId: "user-1",
        title: "My Story",
      },
      pages: [
        {
          generatedImageUrl: "https://cdn.example.com/page-1.jpg",
        },
      ],
    });

    jsPdfConstructorMock.mockImplementation(() => ({
      addPage: vi.fn(),
      addImage: vi.fn(),
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      text: vi.fn(),
      getTextDimensions: vi.fn(() => ({ w: 10, h: 4 })),
      link: vi.fn(),
      output: vi.fn(() => new Uint8Array([1, 2, 3]).buffer),
    }));
  });

  it("rejects invalid storySlug query", async () => {
    const response = await GET(buildRequest(" ".repeat(200)));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("storySlug"),
    });
    expect(getStoryWithPagesBySlugMock).not.toHaveBeenCalled();
  });

  it("rejects non-https/private image URLs from story pages", async () => {
    getStoryWithPagesBySlugMock.mockResolvedValueOnce({
      story: { id: "story-1", userId: "user-1", title: "My Story" },
      pages: [{ generatedImageUrl: "http://localhost:3000/x.jpg" }],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(buildRequest("story-1"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid page image URL for PDF export.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns PDF for valid story image URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "image/jpeg",
        "content-length": "3",
      }),
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(buildRequest("story-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("My Story.pdf");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
