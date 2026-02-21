import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authMock,
  createStoryMock,
  createPageMock,
  getNextPageNumberMock,
  getStoryByIdMock,
  getLastPageImageMock,
  reserveGenerationCreditMock,
  refundGenerationCreditMock,
  uploadImageToS3Mock,
  buildComicPromptMock,
  generateComicImageWithAdapterFallbackMock,
  generateStoryMetadataMock,
  mapTogetherGenerationErrorMock,
  getImageModelAdapterProfilesMock,
  acquireGenerationIdempotencyMock,
  completeGenerationIdempotencyMock,
  getIdempotencyKeyFromHeadersMock,
  releaseGenerationIdempotencyMock,
  togetherConstructorMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  createStoryMock: vi.fn(),
  createPageMock: vi.fn(),
  getNextPageNumberMock: vi.fn(),
  getStoryByIdMock: vi.fn(),
  getLastPageImageMock: vi.fn(),
  reserveGenerationCreditMock: vi.fn(),
  refundGenerationCreditMock: vi.fn(),
  uploadImageToS3Mock: vi.fn(),
  buildComicPromptMock: vi.fn(),
  generateComicImageWithAdapterFallbackMock: vi.fn(),
  generateStoryMetadataMock: vi.fn(),
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
  createStory: createStoryMock,
  createPage: createPageMock,
  getNextPageNumber: getNextPageNumberMock,
  getStoryById: getStoryByIdMock,
  getLastPageImage: getLastPageImageMock,
}));

vi.mock("@/lib/rate-limit", () => ({
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
  generateStoryMetadata: generateStoryMetadataMock,
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

import { POST } from "@/app/api/generate-comic/route";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/generate-comic", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": "idem-1",
    },
    body: JSON.stringify(body),
  });
}

describe("api/generate-comic route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.TOGETHER_API_KEY = "test-key";

    authMock.mockResolvedValue({ userId: "user-1" });
    getIdempotencyKeyFromHeadersMock.mockReturnValue("idem-1");
    acquireGenerationIdempotencyMock.mockResolvedValue({
      kind: "acquired",
      token: { enabled: true, redisKey: "lock-1" },
    });

    reserveGenerationCreditMock.mockResolvedValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 3600,
    });

    buildComicPromptMock.mockReturnValue("full prompt");
    getImageModelAdapterProfilesMock.mockReturnValue([
      { id: "primary", model: "model-1", dimensions: { width: 864, height: 1184 } },
    ]);
    togetherConstructorMock.mockReturnValue({});

    generateStoryMetadataMock.mockResolvedValue({
      title: "Generated",
      description: "Desc",
    });

    mapTogetherGenerationErrorMock.mockReturnValue(null);
  });

  it("rejects invalid payload before idempotency and credit reservation", async () => {
    const response = await POST(
      buildRequest({ prompt: "hello", characterImages: ["not-a-url"] }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("characterImages"),
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

    const response = await POST(buildRequest({ prompt: "hello" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imageUrl: "https://cached" });
    expect(reserveGenerationCreditMock).not.toHaveBeenCalled();
    expect(generateComicImageWithAdapterFallbackMock).not.toHaveBeenCalled();
  });

  it("refunds credits when generation fails before persistence", async () => {
    generateComicImageWithAdapterFallbackMock.mockRejectedValueOnce(
      new Error("provider down"),
    );

    const response = await POST(buildRequest({ prompt: "hello" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Generation failed. Please retry.",
    });

    expect(reserveGenerationCreditMock).toHaveBeenCalledWith("user-1");
    expect(refundGenerationCreditMock).toHaveBeenCalledWith("user-1");
    expect(createStoryMock).not.toHaveBeenCalled();
    expect(createPageMock).not.toHaveBeenCalled();
    expect(uploadImageToS3Mock).not.toHaveBeenCalled();
    expect(releaseGenerationIdempotencyMock).toHaveBeenCalledWith({
      enabled: true,
      redisKey: "lock-1",
    });
    expect(completeGenerationIdempotencyMock).not.toHaveBeenCalled();
  });
});
