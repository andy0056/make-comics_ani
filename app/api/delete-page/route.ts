import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStoryWithPagesBySlug, deletePage } from "@/lib/db-actions";
import {
  deletePageRequestSchema,
  getRequestValidationErrorMessage,
} from "@/lib/api-request-validation";

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsedRequest = deletePageRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: getRequestValidationErrorMessage(parsedRequest.error) },
        { status: 400 }
      );
    }

    const { storySlug, pageId } = parsedRequest.data;

    // Get the story to check ownership
    const storyData = await getStoryWithPagesBySlug(storySlug);
    if (!storyData) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const { story, pages } = storyData;

    // Check ownership
    if (story.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check if page exists and belongs to the story
    const pageExists = pages.some(p => p.id === pageId);
    if (!pageExists) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    // Don't allow deleting the last page
    if (pages.length <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last page of a story" },
        { status: 400 }
      );
    }

    await deletePage(pageId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting page:", error);
    return NextResponse.json(
      {
        error: "Internal server error.",
      },
      { status: 500 }
    );
  }
}
