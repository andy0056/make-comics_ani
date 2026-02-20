import Together from "together-ai";
import {
  getContentPolicyErrorMessage,
  isContentPolicyViolation,
} from "@/lib/utils";
import { type ModelAdapterProfile } from "@/lib/model-adapters";

type ImageGenerationResponse = Awaited<
  ReturnType<Together["images"]["generate"]>
>;

type StoryMetadata = {
  title: string;
  description: string | undefined;
};

type MappedTogetherError = {
  status: number;
  error: string;
  errorType: "content_policy" | "credit_limit" | "api_error";
};

export async function generateComicImage({
  client,
  model,
  prompt,
  width,
  height,
  referenceImages,
  temperature,
}: {
  client: Together;
  model: string;
  prompt: string;
  width: number;
  height: number;
  referenceImages?: string[];
  temperature?: number;
}): Promise<{ response: ImageGenerationResponse; durationMs: number }> {
  const startTime = Date.now();
  const response = await client.images.generate({
    model,
    prompt,
    width,
    height,
    temperature,
    reference_images: referenceImages && referenceImages.length > 0
      ? referenceImages
      : undefined,
  });

  return {
    response,
    durationMs: Date.now() - startTime,
  };
}

export async function generateComicImageWithAdapterFallback({
  client,
  adapters,
  prompt,
  width,
  height,
  referenceImages,
  temperature,
  onAdapterFailure,
}: {
  client: Together;
  adapters: ModelAdapterProfile[];
  prompt: string;
  width: number;
  height: number;
  referenceImages?: string[];
  temperature?: number;
  onAdapterFailure?: (adapter: ModelAdapterProfile, error: unknown) => void;
}): Promise<{
  response: ImageGenerationResponse;
  durationMs: number;
  adapterUsed: ModelAdapterProfile;
}> {
  let lastError: unknown = null;

  for (const adapter of adapters) {
    try {
      const result = await generateComicImage({
        client,
        model: adapter.model,
        prompt,
        width,
        height,
        referenceImages,
        temperature,
      });

      return {
        response: result.response,
        durationMs: result.durationMs,
        adapterUsed: adapter,
      };
    } catch (error) {
      onAdapterFailure?.(adapter, error);
      lastError = error;
    }
  }

  throw lastError ?? new Error("Image generation failed across all adapters");
}

export async function generateStoryMetadata({
  client,
  prompt,
  styleLabel,
  fallbackTitle,
  onError,
}: {
  client: Together;
  prompt: string;
  styleLabel: string;
  fallbackTitle: string;
  onError?: (error: unknown) => void;
}): Promise<StoryMetadata> {
  try {
    const titlePrompt = `Based on this comic book prompt, generate a compelling title and description for the comic book.

Prompt: "${prompt}"
Style: ${styleLabel}

Generate:
1. A catchy, engaging title (maximum 60 characters)
2. A brief description (2-3 sentences, maximum 200 characters)

Format your response as JSON:
{
  "title": "Title here",
  "description": "Description here"
}

Only return the JSON, no other text.`;

    const textResponse = await client.chat.completions.create({
      model: "Qwen/Qwen3-Next-80B-A3B-Instruct",
      messages: [
        {
          role: "system",
          content:
            "You are a creative assistant that generates compelling comic book titles and descriptions. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: titlePrompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    const content = textResponse.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("No response from text generation");
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const rawTitle = parsed.title?.trim() || fallbackTitle;
    const rawDescription = parsed.description?.trim();

    const title =
      rawTitle.length > 60 ? rawTitle.substring(0, 57) + "..." : rawTitle;
    const description =
      rawDescription && rawDescription.length > 200
        ? rawDescription.substring(0, 197) + "..."
        : rawDescription;

    return {
      title,
      description: description || undefined,
    };
  } catch (error) {
    onError?.(error);
    return {
      title: fallbackTitle,
      description: undefined,
    };
  }
}

export function mapTogetherGenerationError({
  error,
  creditLimitMessage,
}: {
  error: unknown;
  creditLimitMessage: string;
}): MappedTogetherError | null {
  if (
    error instanceof Error &&
    error.message &&
    isContentPolicyViolation(error.message)
  ) {
    return {
      status: 400,
      error: getContentPolicyErrorMessage(),
      errorType: "content_policy",
    };
  }

  if (error instanceof Error && "status" in error) {
    const rawStatus = (error as { status?: unknown }).status;
    const status = typeof rawStatus === "number" ? rawStatus : 500;

    if (status === 402) {
      return {
        status: 402,
        error: creditLimitMessage,
        errorType: "credit_limit",
      };
    }

    return {
      status,
      error: error.message || `Failed to generate image: ${status}`,
      errorType: "api_error",
    };
  }

  return null;
}
