import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authMock,
  updatePageMock,
  createPageMock,
  getNextPageNumberMock,
  getStoryWithPagesBySlugMock,
  checkGenerationBurstLimitMock,
  reserveGenerationCreditMock,
  refundGenerationCreditMock,
  uploadImageToS3Mock,
  buildComicPromptMock,
  generateComicImageWithAdapterFallbackMock,
  mapTogetherGenerationErrorMock,
  getImageModelAdapterProfilesMock,
  acquireGenerationIdempotencyMock,
  completeGenerationIdempotencyMock,
  getIdempotencyKeyFromHeadersMock,
  releaseGenerationIdempotencyMock,
  togetherConstructorMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  updatePageMock: vi.fn(),
  createPageMock: vi.fn(),
  getNextPageNumberMock: vi.fn(),
  getStoryWithPagesBySlugMock: vi.fn(),
  checkGenerationBurstLimitMock: vi.fn(),
  reserveGenerationCreditMock: vi.fn(),
  refundGenerationCreditMock: vi.fn(),
  uploadImageToS3Mock: vi.fn(),
  buildComicPromptMock: vi.fn(),
  generateComicImageWithAdapterFallbackMock: vi.fn(),
  mapTogetherGenerationErrorMock: vi.fn(),
  getImageModelAdapterProfilesMock: vi.fn(),
  acquireGenerationIdempotencyMock: vi.fn(),
  completeGenerationIdempotencyMock: vi.fn(),
  getIdempotencyKeyFromHeadersMock: vi.fn(),
  releaseGenerationIdempotencyMock: vi.fn(),
  togetherConstructorMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/db-actions", () => ({
  updatePage: updatePageMock,
  createPage: createPageMock,
  getNextPageNumber: getNextPageNumberMock,
  getStoryWithPagesBySlug: getStoryWithPagesBySlugMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkGenerationBurstLimit: checkGenerationBurstLimitMock,
  reserveGenerationCredit: reserveGenerationCreditMock,
  refundGenerationCredit: refundGenerationCreditMock,
}));

vi.mock("@/lib/s3-upload", () => ({
  uploadImageToS3: uploadImageToS3Mock,
}));

vi.mock("@/lib/prompt", () => ({
  buildComicPrompt: buildComicPromptMock,
}));

vi.mock("@/lib/comic-ai-service", () => ({
  generateComicImageWithAdapterFallback: generateComicImageWithAdapterFallbackMock,
  mapTogetherGenerationError: mapTogetherGenerationErrorMock,
}));

vi.mock("@/lib/model-adapters", () => ({
  getImageModelAdapterProfiles: getImageModelAdapterProfilesMock,
}));

vi.mock("@/lib/generation-idempotency", () => ({
  acquireGenerationIdempotency: acquireGenerationIdempotencyMock,
  completeGenerationIdempotency: completeGenerationIdempotencyMock,
  getIdempotencyKeyFromHeaders: getIdempotencyKeyFromHeadersMock,
  releaseGenerationIdempotency: releaseGenerationIdempotencyMock,
}));

vi.mock("together-ai", () => ({
  default: togetherConstructorMock,
}));

import { POST } from "@/app/api/add-page/route";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/add-page", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": "idem-2",
    },
    body: JSON.stringify(body),
  });
}

describe("api/add-page route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.TOGETHER_API_KEY = "test-key";

    authMock.mockResolvedValue({ userId: "user-1" });
    getIdempotencyKeyFromHeadersMock.mockReturnValue("idem-2");
    acquireGenerationIdempotencyMock.mockResolvedValue({
      kind: "acquired",
      token: { enabled: true, redisKey: "lock-2" },
    });
    checkGenerationBurstLimitMock.mockResolvedValue({
      success: true,
      limit: 6,
      remaining: 5,
      reset: Date.now() + 60,
    });

    reserveGenerationCreditMock.mockResolvedValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 3600,
    });

    getStoryWithPagesBySlugMock.mockResolvedValue({
      story: {
        id: "story-1",
        slug: "story-slug",
        userId: "user-1",
        style: "noir",
      },
      pages: [],
    });

    getNextPageNumberMock.mockResolvedValue(2);
    buildComicPromptMock.mockReturnValue("full prompt");

    getImageModelAdapterProfilesMock.mockReturnValue([
      { id: "primary", model: "model-1", dimensions: { width: 864, height: 1184 } },
    ]);

    togetherConstructorMock.mockReturnValue({});
    mapTogetherGenerationErrorMock.mockReturnValue(null);
  });

  it("rejects invalid payload before idempotency and credit reservation", async () => {
    const response = await POST(
      buildRequest({
        storyId: "story-slug",
        prompt: "continue",
        panelLayout: "invalid-layout",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("panelLayout"),
    });
    expect(acquireGenerationIdempotencyMock).not.toHaveBeenCalled();
    expect(reserveGenerationCreditMock).not.toHaveBeenCalled();
  });

  it("rejects invalid redraw pageId before idempotency and credit reservation", async () => {
    const response = await POST(
      buildRequest({
        storyId: "story-slug",
        pageId: "not-a-uuid",
        prompt: "continue",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("pageId"),
    });
    expect(acquireGenerationIdempotencyMock).not.toHaveBeenCalled();
    expect(reserveGenerationCreditMock).not.toHaveBeenCalled();
  });

  it("rejects unknown payload keys before idempotency and credit reservation", async () => {
    const response = await POST(
      buildRequest({
        storyId: "story-slug",
        prompt: "continue",
        debug: true,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringMatching(/unrecognized|unknown/i),
    });
    expect(acquireGenerationIdempotencyMock).not.toHaveBeenCalled();
    expect(reserveGenerationCreditMock).not.toHaveBeenCalled();
  });

  it("requires a valid idempotency key header", async () => {
    getIdempotencyKeyFromHeadersMock.mockReturnValueOnce(null);

    const response = await POST(
      buildRequest({ storyId: "story-slug", prompt: "continue" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        "A valid x-idempotency-key header is required for generation requests.",
    });
    expect(acquireGenerationIdempotencyMock).not.toHaveBeenCalled();
    expect(reserveGenerationCreditMock).not.toHaveBeenCalled();
  });

  it("replays cached result and skips credit reservation", async () => {
    acquireGenerationIdempotencyMock.mockResolvedValueOnce({
      kind: "replay",
      status: 200,
      body: { imageUrl: "https://cached" },
    });

    const response = await POST(
      buildRequest({ storyId: "story-slug", prompt: "continue" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imageUrl: "https://cached" });
    expect(checkGenerationBurstLimitMock).not.toHaveBeenCalled();
    expect(reserveGenerationCreditMock).not.toHaveBeenCalled();
    expect(generateComicImageWithAdapterFallbackMock).not.toHaveBeenCalled();
  });

  it("returns 429 when burst page-generation limit is exceeded", async () => {
    checkGenerationBurstLimitMock.mockResolvedValueOnce({
      success: false,
      limit: 6,
      remaining: 0,
      reset: 54321,
    });

    const response = await POST(
      buildRequest({ storyId: "story-slug", prompt: "continue" }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error:
        "Too many page-generation attempts in a short time. Please wait a minute and retry.",
      isRateLimited: true,
      creditsRemaining: 0,
      resetTime: 54321,
    });
    expect(reserveGenerationCreditMock).not.toHaveBeenCalled();
  });

  it("refunds credits when add-page generation fails", async () => {
    generateComicImageWithAdapterFallbackMock.mockRejectedValueOnce(
      new Error("provider down"),
    );

    const response = await POST(
      buildRequest({ storyId: "story-slug", prompt: "continue" }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Generation failed. Please retry.",
    });

    expect(reserveGenerationCreditMock).toHaveBeenCalledWith("user-1");
    expect(refundGenerationCreditMock).toHaveBeenCalledWith("user-1");
    expect(createPageMock).not.toHaveBeenCalled();
    expect(updatePageMock).not.toHaveBeenCalled();
    expect(uploadImageToS3Mock).not.toHaveBeenCalled();
    expect(releaseGenerationIdempotencyMock).toHaveBeenCalledWith({
      enabled: true,
      redisKey: "lock-2",
    });
    expect(completeGenerationIdempotencyMock).not.toHaveBeenCalled();
  });
});
