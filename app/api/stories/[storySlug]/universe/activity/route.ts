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

    return NextResponse.json({
      activity: {
        generatedAt: new Date().toISOString(),
        eventCount: 0,
        events: [],
        activeBranches: [],
      },
      access: accessResult.access,
    });
  } catch (error) {
    console.error("Universe activity GET error:", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
