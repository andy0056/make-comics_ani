import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { stories } from "@/lib/schema";
import {
  getRequestValidationErrorMessage,
  shareSettingsRequestSchema,
} from "@/lib/api-request-validation";

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

    const parsedRequest = shareSettingsRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: getRequestValidationErrorMessage(parsedRequest.error) },
        { status: 400 },
      );
    }
    const { action } = parsedRequest.data;

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
