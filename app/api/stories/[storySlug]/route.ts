import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deleteStory, updateStory } from "@/lib/db-actions";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";
import {
  getRequestValidationErrorMessage,
  storyTitleUpdateRequestSchema,
} from "@/lib/api-request-validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { storySlug: slug } = await params;

    if (!slug) {
      return NextResponse.json(
        { error: "Story slug is required" },
        { status: 400 },
      );
    }

    const accessResult = await getOwnedStoryWithPagesBySlug({
      storySlug: slug,
      userId,
      requiredPermission: "view",
      unauthorizedMode: "not_found",
    });

    if (!accessResult.ok) {
      return NextResponse.json(
        { error: accessResult.error },
        { status: accessResult.status },
      );
    }

    return NextResponse.json({
      story: accessResult.story,
      pages: accessResult.pages,
      isOwner: accessResult.access.isOwner,
      access: accessResult.access,
    });
  } catch (error) {
    console.error("Error fetching story:", error);
    return NextResponse.json(
      { error: "Failed to fetch story" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { storySlug: slug } = await params;

    if (!slug) {
      return NextResponse.json(
        { error: "Story slug is required" },
        { status: 400 },
      );
    }

    const accessResult = await getOwnedStoryWithPagesBySlug({
      storySlug: slug,
      userId,
      requiredPermission: "manage",
      unauthorizedMode: "unauthorized",
    });

    if (!accessResult.ok) {
      return NextResponse.json(
        { error: accessResult.error },
        { status: accessResult.status },
      );
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsedRequest = storyTitleUpdateRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: getRequestValidationErrorMessage(parsedRequest.error) },
        { status: 400 },
      );
    }

    await updateStory(accessResult.story.id, { title: parsedRequest.data.title });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating story:", error);
    return NextResponse.json(
      { error: "Failed to update story" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { storySlug: slug } = await params;

    if (!slug) {
      return NextResponse.json(
        { error: "Story slug is required" },
        { status: 400 },
      );
    }

    const accessResult = await getOwnedStoryWithPagesBySlug({
      storySlug: slug,
      userId,
      requiredPermission: "manage",
      unauthorizedMode: "unauthorized",
    });

    if (!accessResult.ok) {
      return NextResponse.json(
        { error: accessResult.error },
        { status: accessResult.status },
      );
    }

    await deleteStory(accessResult.story.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting story:", error);
    return NextResponse.json(
      { error: "Failed to delete story" },
      { status: 500 },
    );
  }
}
