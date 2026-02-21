import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Together from "together-ai";
import {
  updatePage,
  createPage,
  getNextPageNumber,
  getStoryWithPagesBySlug,
  deletePage,
} from "@/lib/db-actions";
import { freeTierRateLimit } from "@/lib/rate-limit";
import { uploadImageToS3 } from "@/lib/s3-upload";
import { buildComicPrompt } from "@/lib/prompt";
import {
  generateComicImageWithAdapterFallback,
  mapTogetherGenerationError,
} from "@/lib/comic-ai-service";
import { getImageModelAdapterProfiles } from "@/lib/model-adapters";

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
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const {
      storyId,
      pageId,
      prompt,
      panelLayout,
      characterImages = [],
    } = await request.json();

    if (!storyId || !prompt) {
      return NextResponse.json(
        { error: "Missing required fields: storyId and prompt" },
        { status: 400 },
      );
    }

    const rateLimitResult = await freeTierRateLimit.limit(userId);
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

    const finalApiKey = process.env.TOGETHER_API_KEY;
    if (!finalApiKey) {
      return NextResponse.json(
        { error: "Server configuration error - default API key not available" },
        { status: 500 },
      );
    }

    // Get the story and all its pages
    const storyData = await getStoryWithPagesBySlug(storyId);
    if (!storyData) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const { story, pages } = storyData;

    // Check ownership
    if (story.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    let page;
    let pageNumber;
    let isRedraw = false;

    if (pageId) {
      // Redraw mode: update existing page
      isRedraw = true;
      const storyData = await getStoryWithPagesBySlug(storyId);
      if (!storyData) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }

      const existingPage = storyData.pages.find((p) => p.id === pageId);
      if (!existingPage) {
        return NextResponse.json({ error: "Page not found" }, { status: 404 });
      }

      page = existingPage;
      pageNumber = existingPage.pageNumber;
    } else {
      // Add new page mode
      pageNumber = await getNextPageNumber(story.id);
      page = await createPage({
        storyId: story.id,
        pageNumber,
        prompt,
        characterImageUrls: characterImages,
      });
    }

    const adapters = getImageModelAdapterProfiles();
    const dimensions = adapters[0].dimensions;

    // Collect reference images: previous page + story characters + current characters
    const referenceImages: string[] = [];

    // Get previous page image for style consistency (unless it's page 1)
    if (pageNumber > 1) {
      // Always use the previous page's image, regardless of new page or redraw
      const storyData = await getStoryWithPagesBySlug(storyId);
      if (storyData) {
        const previousPage = storyData.pages.find(
          (p) => p.pageNumber === pageNumber - 1,
        );
        if (previousPage?.generatedImageUrl) {
          referenceImages.push(previousPage.generatedImageUrl);
        }
      }
    }

    // Use only the character images sent from the frontend (user's selection)
    // These are already the most recent/relevant characters the user wants to use
    referenceImages.push(...characterImages);

    // Build the prompt with continuation context
    // For redraw, only include pages up to the current page being redrawn
    // For new page, include all existing pages
    const relevantPages = isRedraw
      ? pages.filter((p) => p.pageNumber < pageNumber)
      : pages;

    const previousPages = relevantPages.map((p) => ({
      prompt: p.prompt,
    }));

    const fullPrompt = buildComicPrompt({
      prompt,
      style: story.style,
      panelLayoutId: panelLayout,
      characterImages,
      isAddPage: true,
      previousPages,
    });

    const client = new Together({
      apiKey: finalApiKey,
    });

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

      // Clean up on failure (for new pages, not redraws)
      if (!isRedraw) {
        try {
          await deletePage(page.id);
        } catch (cleanupError) {
          console.error("Error cleaning up DB on failure:", cleanupError);
        }
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
        creditLimitMessage: "Insufficient API credits.",
      });

      if (mapped) {
        return NextResponse.json(
          { error: mapped.error, errorType: mapped.errorType },
          { status: mapped.status },
        );
      }

      return NextResponse.json(
        {
          error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}`,
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
    const s3Key = `${story.id}/page-${page.pageNumber}-${Date.now()}.jpg`;
    const s3ImageUrl = await uploadImageToS3(imageUrl, s3Key);

    await updatePage(page.id, s3ImageUrl);

    return NextResponse.json({
      imageUrl: s3ImageUrl,
      pageId: page.id,
      pageNumber: page.pageNumber,
    });
  } catch (error) {
    console.error("Error in add-page API:", error);
    return NextResponse.json(
      {
        error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"
          }`,
      },
      { status: 500 },
    );
  }
}
