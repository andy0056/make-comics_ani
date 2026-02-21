import { type NextRequest, NextResponse } from "next/server";
import Together from "together-ai";
import { auth } from "@clerk/nextjs/server";
import {
  updatePage,
  updateStory,
  createStory,
  createPage,
  getNextPageNumber,
  getStoryById,
  getLastPageImage,
  deletePage,
  deleteStory,
} from "@/lib/db-actions";
import {
  reserveGenerationCredit,
  refundGenerationCredit,
} from "@/lib/rate-limit";
import { uploadImageToS3 } from "@/lib/s3-upload";
import { buildComicPrompt } from "@/lib/prompt";
import {
  generateComicImageWithAdapterFallback,
  generateStoryMetadata,
  mapTogetherGenerationError,
} from "@/lib/comic-ai-service";
import { getImageModelAdapterProfiles } from "@/lib/model-adapters";
import {
  acquireGenerationIdempotency,
  completeGenerationIdempotency,
  getIdempotencyKeyFromHeaders,
  releaseGenerationIdempotency,
  type IdempotencyToken,
} from "@/lib/generation-idempotency";

type ErrorInspection = {
  codes: Set<string>;
  messages: string[];
};

function inspectError(error: unknown): ErrorInspection {
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();
  const codes = new Set<string>();
  const messages: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (current instanceof Error) {
      messages.push(current.message);

      const maybeCode = (current as { code?: unknown }).code;
      if (typeof maybeCode === "string") {
        codes.add(maybeCode);
      }

      const maybeCause = (current as { cause?: unknown }).cause;
      if (maybeCause) {
        queue.push(maybeCause);
      }
    }

    if (
      typeof current === "object" &&
      current !== null &&
      "errors" in current
    ) {
      const nestedErrors = (current as { errors?: unknown }).errors;
      if (Array.isArray(nestedErrors)) {
        queue.push(...nestedErrors);
      }
    }
  }

  return { codes, messages };
}

function isDatabaseUnavailableError(error: unknown): boolean {
  const { codes, messages } = inspectError(error);
  const knownCodes = ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT"];

  if (knownCodes.some((code) => codes.has(code))) {
    return true;
  }

  return messages.some((message) =>
    /connection refused|database.*unavailable|timeout/i.test(message),
  );
}

function isInvalidReferenceImageError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("invalid reference image") ||
    message.includes("reference_images[")
  );
}

export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let idempotencyToken: IdempotencyToken | null = null;
  let idempotencyCompleted = false;
  let creditReserved = false;
  let creditCommitted = false;

  try {
    const authResult = await auth();
    userId = authResult.userId;

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const {
      storyId,
      prompt,
      style = "noir",
      panelLayout,
      characterImages = [],
      isContinuation = false,
      previousContext = "",
    } = await request.json();

    const idempotencyResult = await acquireGenerationIdempotency({
      scope: storyId ? `generate-comic:${storyId}` : "generate-comic:new-story",
      userId,
      idempotencyKey: getIdempotencyKeyFromHeaders(request.headers),
    });

    if (idempotencyResult.kind === "replay") {
      return NextResponse.json(idempotencyResult.body, {
        status: idempotencyResult.status,
      });
    }

    if (idempotencyResult.kind === "in_progress") {
      return NextResponse.json(
        {
          error:
            "A matching generation request is already in progress. Please wait a moment and retry.",
        },
        { status: 409 },
      );
    }

    idempotencyToken = idempotencyResult.token;

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const usesOwnApiKey = false;

    // Use default platform API key
    const finalApiKey = process.env.TOGETHER_API_KEY;
    if (!finalApiKey) {
      return NextResponse.json(
        {
          error: "Server configuration error - default API key not available",
        },
        { status: 500 },
      );
    }

    let story;
    const referenceImages: string[] = [];

    if (storyId) {
      // Continuation: get previous page image and story character images
      story = await getStoryById(storyId);
      if (!story) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }
      if (story.userId !== userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    // Reserve one credit before generation; refunded on any non-success path.
    const rateLimitResult = await reserveGenerationCredit(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error:
            "Credits exhausted. You are limited to 15 generations per week during the beta.",
          isRateLimited: true,
          creditsRemaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.reset,
        },
        { status: 429 },
      );
    }
    creditReserved = true;

    let page;
    if (storyId) {
      const nextPageNumber = await getNextPageNumber(storyId);
      page = await createPage({
        storyId,
        pageNumber: nextPageNumber,
        prompt,
        characterImageUrls: characterImages,
      });

      // Get previous page image for style consistency (unless it's page 1)
      if (nextPageNumber > 1) {
        const lastPageImage = await getLastPageImage(storyId);
        if (lastPageImage) {
          referenceImages.push(lastPageImage);
        }
      }

      // For continuation pages, character images are sent from frontend
      // No need to fetch separately - frontend handles selection
    } else {
      // New story: no previous page reference
      // Create story with temporary title, will update with generated title
      story = await createStory({
        title: prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt,
        description: undefined,
        userId: userId,
        style,
        usesOwnApiKey,
      });

      page = await createPage({
        storyId: story.id,
        pageNumber: 1,
        prompt,
        characterImageUrls: characterImages,
      });
    }

    // Use only the character images sent from the frontend
    referenceImages.push(...characterImages);

    const adapters = getImageModelAdapterProfiles();
    const dimensions = adapters[0].dimensions;

    const fullPrompt = buildComicPrompt({
      prompt,
      style,
      panelLayoutId: panelLayout,
      characterImages,
      isContinuation,
      previousContext,
    });

    const client = new Together({ apiKey: finalApiKey });

    // Generate title and description in parallel with image generation (only for new stories)
    const fallbackTitle = prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt;
    let titleGenerationPromise: Promise<{
      title: string;
      description: string | undefined;
    }> | null = null;
    if (!storyId) {
      titleGenerationPromise = generateStoryMetadata({
        client,
        prompt,
        styleLabel: style,
        fallbackTitle,
        onError: (error) => console.error("Error generating title and description:", error),
      });
    }

    let imageResult;
    try {
      console.log("Starting image generation...");
      imageResult = await generateComicImageWithAdapterFallback({
        client,
        adapters,
        prompt: fullPrompt,
        width: dimensions.width,
        height: dimensions.height,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        temperature: 0.1,
        onAdapterFailure: (adapter, error) =>
          console.warn(`Adapter ${adapter.id} (${adapter.model}) failed:`, error),
      });
      const durationSeconds = (imageResult.durationMs / 1000).toFixed(2);
      console.log(`Image generation completed in ${durationSeconds}s using ${imageResult.adapterUsed.model}`);
    } catch (error) {
      console.error("Image generation error:", error);

      // Clean up DB records if generation failed
      try {
        if (!storyId) {
          await deleteStory(story!.id);
        } else {
          await deletePage(page.id);
        }
      } catch (cleanupError) {
        console.error("Error cleaning up DB on image generation failure:", cleanupError);
      }

      if (isInvalidReferenceImageError(error)) {
        return NextResponse.json(
          {
            error: "One of the reference images could not be processed. Please upload PNG or JPG/JPEG images and try again.",
            errorType: "invalid_reference_image",
          },
          { status: 400 },
        );
      }

      const mapped = mapTogetherGenerationError({
        error,
        creditLimitMessage:
          "Insufficient API credits. Please add credits to your Together.ai account at https://api.together.ai/settings/billing or update your API key.",
      });

      if (mapped) {
        return NextResponse.json(
          { error: mapped.error, errorType: mapped.errorType },
          { status: mapped.status },
        );
      }

      return NextResponse.json(
        {
          error: "Generation failed. Please retry.",
        },
        { status: 500 },
      );
    }

    const response = imageResult.response;
    if (!response.data || !response.data[0] || !response.data[0].url) {
      return NextResponse.json(
        { error: "No image URL in response" },
        { status: 500 },
      );
    }

    const imageUrl = response.data[0].url;

    // Upload image to S3 for permanent storage
    const s3Key = `${storyId || story!.id}/page-${page.pageNumber
      }-${Date.now()}.jpg`;
    const s3ImageUrl = await uploadImageToS3(imageUrl, s3Key);

    // Wait for title/description generation if it's a new story
    let generatedTitle: string | undefined;
    let generatedDescription: string | undefined;
    if (titleGenerationPromise) {
      const titleData = await titleGenerationPromise;
      generatedTitle = titleData.title;
      generatedDescription = titleData.description;

      // Update story with generated title and description
      try {
        await updateStory(story!.id, {
          title: generatedTitle,
          description: generatedDescription,
        });
        // Update story object for response
        story = {
          ...story,
          title: generatedTitle,
          description: generatedDescription,
        };
      } catch (dbError) {
        console.error("Error updating story title/description:", dbError);
        // Continue even if update fails
      }
    }

    // Update page in database with S3 URL
    try {
      await updatePage(page.id, s3ImageUrl);
    } catch (dbError) {
      console.error("Error updating page in database:", dbError);
      return NextResponse.json(
        { error: "Failed to save generated image" },
        { status: 500 },
      );
    }

    const responseData = storyId
      ? { imageUrl: s3ImageUrl, pageId: page.id, pageNumber: page.pageNumber }
      : {
          imageUrl: s3ImageUrl,
          storyId: story!.id,
          storySlug: story!.slug,
          pageId: page.id,
          pageNumber: page.pageNumber,
          title: generatedTitle || story!.title,
          description: generatedDescription || story!.description,
        };

    creditCommitted = true;
    if (idempotencyToken) {
      await completeGenerationIdempotency({
        token: idempotencyToken,
        status: 200,
        body: responseData,
      });
      idempotencyCompleted = true;
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error in generate-comic API:", error);
    const isDatabaseUnavailable = isDatabaseUnavailableError(error);

    return NextResponse.json(
      {
        error: isDatabaseUnavailable
          ? "Database unavailable. Ensure Postgres is running and DATABASE_URL is reachable."
          : "Internal server error.",
      },
      { status: isDatabaseUnavailable ? 503 : 500 },
    );
  } finally {
    if (creditReserved && !creditCommitted && userId) {
      await refundGenerationCredit(userId);
    }

    if (idempotencyToken && !idempotencyCompleted) {
      await releaseGenerationIdempotency(idempotencyToken);
    }
  }
}
