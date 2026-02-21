import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { stories } from "@/lib/schema";

type ShareAction = "enable" | "disable" | "rotate";

function getBaseOrigin(request: NextRequest): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  return request.nextUrl.origin;
}

function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function buildShareUrl(baseOrigin: string, storySlug: string, token: string): string {
  return `${baseOrigin}/story/${storySlug}/share?token=${encodeURIComponent(token)}`;
}

async function getOwnedStory(storySlug: string, userId: string) {
  const rows = await db
    .select()
    .from(stories)
    .where(and(eq(stories.slug, storySlug), eq(stories.userId, userId)))
    .limit(1);

  return rows[0] ?? null;
}

function parseShareAction(body: unknown): ShareAction | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const action = (body as { action?: unknown }).action;
  if (action === "enable" || action === "disable" || action === "rotate") {
    return action;
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { storySlug } = await params;
    if (!storySlug) {
      return NextResponse.json({ error: "Story slug is required" }, { status: 400 });
    }

    const story = await getOwnedStory(storySlug, userId);
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const baseOrigin = getBaseOrigin(request);
    const shareUrl = story.isPublicShare && story.shareToken
      ? buildShareUrl(baseOrigin, story.slug, story.shareToken)
      : null;

    return NextResponse.json({
      share: {
        isPublicShare: story.isPublicShare,
        shareToken: story.shareToken,
        shareUpdatedAt: story.shareUpdatedAt?.toISOString() ?? null,
        shareUrl,
      },
    });
  } catch (error) {
    console.error("Error loading share settings:", error);
    return NextResponse.json({ error: "Failed to load share settings" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { storySlug } = await params;
    if (!storySlug) {
      return NextResponse.json({ error: "Story slug is required" }, { status: 400 });
    }

    const story = await getOwnedStory(storySlug, userId);
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const action = parseShareAction(body);
    if (!action) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    let isPublicShare = story.isPublicShare;
    let shareToken = story.shareToken;

    if (action === "enable") {
      isPublicShare = true;
      if (!shareToken) {
        shareToken = generateShareToken();
      }
    } else if (action === "disable") {
      isPublicShare = false;
      shareToken = null;
    } else {
      isPublicShare = true;
      shareToken = generateShareToken();
    }

    const now = new Date();

    await db
      .update(stories)
      .set({
        isPublicShare,
        shareToken,
        shareUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(stories.id, story.id));

    const baseOrigin = getBaseOrigin(request);
    const shareUrl = isPublicShare && shareToken
      ? buildShareUrl(baseOrigin, story.slug, shareToken)
      : null;

    return NextResponse.json({
      share: {
        isPublicShare,
        shareToken,
        shareUpdatedAt: now.toISOString(),
        shareUrl,
      },
    });
  } catch (error) {
    console.error("Error updating share settings:", error);
    return NextResponse.json({ error: "Failed to update share settings" }, { status: 500 });
  }
}
