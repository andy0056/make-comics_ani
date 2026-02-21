import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const slug = (await params).storySlug;
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

    const story = accessResult.story;

    return NextResponse.json({
      universe: {
        currentStoryId: story.id,
        rootStoryId: story.id,
        totalStories: 1,
        totalEdges: 0,
        maxDepth: 0,
        nodes: [
          {
            id: story.id,
            slug: story.slug,
            title: story.title,
            style: story.style,
            createdAt: story.createdAt.toISOString(),
            updatedAt: story.updatedAt.toISOString(),
            parentStoryId: null,
            depth: 0,
            remixCount: 0,
            isCurrent: true,
            isRoot: true,
          },
        ],
        edges: [],
      },
      access: accessResult.access,
    });
  } catch (error) {
    console.error("Universe GET error:", error);
    return NextResponse.json({ error: "Failed to load universe" }, { status: 500 });
  }
}
