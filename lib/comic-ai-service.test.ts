import { describe, expect, it, vi } from "vitest";
import Together from "together-ai";
import {
  generateComicImage,
  generateComicImageWithAdapterFallback,
  generateStoryMetadata,
  mapTogetherGenerationError,
} from "@/lib/comic-ai-service";

function createMockClient() {
  return {
    images: {
      generate: vi.fn(),
    },
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  } as unknown as Together;
}

describe("comic-ai-service", () => {
  it("calls Together image generation with expected payload", async () => {
    const client = createMockClient();
    const generateMock = vi.mocked(client.images.generate);
    generateMock.mockResolvedValueOnce({ data: [{ url: "https://img" }] } as any);

    await generateComicImage({
      client,
      model: "google/flash-image-2.5",
      prompt: "test prompt",
      width: 864,
      height: 1184,
      referenceImages: ["https://ref"],
      temperature: 0.1,
    });

    expect(generateMock).toHaveBeenCalledWith({
      model: "google/flash-image-2.5",
      prompt: "test prompt",
      width: 864,
      height: 1184,
      temperature: 0.1,
      reference_images: ["https://ref"],
    });
  });

  it("parses story metadata JSON and enforces length limits", async () => {
    const client = createMockClient();
    const longTitle = "T".repeat(90);
    const longDescription = "D".repeat(230);
    vi.mocked(client.chat.completions.create).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: longTitle,
              description: longDescription,
            }),
          },
        },
      ],
    } as any);

    const result = await generateStoryMetadata({
      client,
      prompt: "Prompt",
      styleLabel: "Noir",
      fallbackTitle: "Fallback",
    });

    expect(result.title.length).toBeLessThanOrEqual(60);
    expect(result.description?.length).toBeLessThanOrEqual(200);
  });

  it("falls back to fallback title when metadata generation fails", async () => {
    const client = createMockClient();
    const onError = vi.fn();
    vi.mocked(client.chat.completions.create).mockRejectedValueOnce(
      new Error("network failure"),
    );

    const result = await generateStoryMetadata({
      client,
      prompt: "Prompt",
      styleLabel: "Noir",
      fallbackTitle: "Fallback Title",
      onError,
    });

    expect(result).toEqual({
      title: "Fallback Title",
      description: undefined,
    });
    expect(onError).toHaveBeenCalledOnce();
  });

  it("maps content policy errors", () => {
    const error = new Error("NO_IMAGE");

    const mapped = mapTogetherGenerationError({
      error,
      creditLimitMessage: "Insufficient API credits.",
    });

    expect(mapped).toEqual({
      status: 400,
      error:
        "Unable to generate image due to content policy. Please try a different prompt.",
      errorType: "content_policy",
    });
  });

  it("maps credit limit errors", () => {
    const error = Object.assign(new Error("payment required"), { status: 402 });

    const mapped = mapTogetherGenerationError({
      error,
      creditLimitMessage: "Insufficient API credits.",
    });

    expect(mapped).toEqual({
      status: 402,
      error: "Insufficient API credits.",
      errorType: "credit_limit",
    });
  });

  it("returns null for unknown non-provider errors", () => {
    const mapped = mapTogetherGenerationError({
      error: new Error("plain unknown error"),
      creditLimitMessage: "Insufficient API credits.",
    });

    expect(mapped).toBeNull();
  });

  it("falls back to secondary adapter when primary model fails", async () => {
    const client = createMockClient();
    const generateMock = vi.mocked(client.images.generate);
    generateMock
      .mockRejectedValueOnce(new Error("primary failed"))
      .mockResolvedValueOnce({ data: [{ url: "https://img-secondary" }] } as any);

    const onAdapterFailure = vi.fn();
    const result = await generateComicImageWithAdapterFallback({
      client,
      adapters: [
        {
          id: "primary",
          provider: "together",
          model: "primary/model",
          capabilities: ["image_generation", "reference_images"],
          costTier: "standard",
          fallbackOrder: 1,
        },
        {
          id: "secondary",
          provider: "together",
          model: "secondary/model",
          capabilities: ["image_generation", "reference_images"],
          costTier: "standard",
          fallbackOrder: 2,
        },
      ],
      prompt: "test prompt",
      width: 864,
      height: 1184,
      onAdapterFailure,
    });

    expect(result.adapterUsed.id).toBe("secondary");
    expect(generateMock).toHaveBeenNthCalledWith(1, {
      model: "primary/model",
      prompt: "test prompt",
      width: 864,
      height: 1184,
      temperature: undefined,
      reference_images: undefined,
    });
    expect(generateMock).toHaveBeenNthCalledWith(2, {
      model: "secondary/model",
      prompt: "test prompt",
      width: 864,
      height: 1184,
      temperature: undefined,
      reference_images: undefined,
    });
    expect(onAdapterFailure).toHaveBeenCalledTimes(1);
  });
});
