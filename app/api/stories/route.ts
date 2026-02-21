import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { stories, pages } from "@/lib/schema";
import { eq } from "drizzle-orm";

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

type StoryListRow = {
  id: string;
  title: string;
  slug: string;
  style: string;
  createdAt: Date | string;
  pageCount: number | null;
  coverImage: string | null;
  pageCreatedAt: Date | string | null;
  pageUpdatedAt: Date | string | null;
};

type StoryListSummary = {
  id: string;
  title: string;
  slug: string;
  style: string;
  createdAt: Date | string;
  pageCount: number;
  coverImage: string | null;
  lastUpdated: Date | string;
};

function toTimestamp(value: Date | string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadStoriesWithBestEffortSchema(userId: string): Promise<StoryListRow[]> {
  try {
    return await db
      .select({
        id: stories.id,
        title: stories.title,
        slug: stories.slug,
        style: stories.style,
        createdAt: stories.createdAt,
        pageCount: pages.pageNumber,
        coverImage: pages.generatedImageUrl,
        pageCreatedAt: pages.createdAt,
        pageUpdatedAt: pages.updatedAt,
      })
      .from(stories)
      .leftJoin(pages, eq(stories.id, pages.storyId))
      .where(eq(stories.userId, userId));
  } catch {
    try {
      // Compatibility fallback for local schemas that may not have page updated_at.
      const fallbackRows = await db
        .select({
          id: stories.id,
          title: stories.title,
          slug: stories.slug,
          style: stories.style,
          createdAt: stories.createdAt,
          pageCount: pages.pageNumber,
          coverImage: pages.generatedImageUrl,
          pageCreatedAt: pages.createdAt,
        })
        .from(stories)
        .leftJoin(pages, eq(stories.id, pages.storyId))
        .where(eq(stories.userId, userId));

      return fallbackRows.map((row) => ({
        ...row,
        pageUpdatedAt: null,
      }));
    } catch {
      try {
        // Fallback when pages shape drifts (or pages table is unavailable for this environment).
        const storiesOnlyRows = await db
          .select({
            id: stories.id,
            title: stories.title,
            slug: stories.slug,
            style: stories.style,
            createdAt: stories.createdAt,
          })
          .from(stories)
          .where(eq(stories.userId, userId));

        return storiesOnlyRows.map((row) => ({
          ...row,
          pageCount: null,
          coverImage: null,
          pageCreatedAt: null,
          pageUpdatedAt: null,
        }));
      } catch {
        // Last-resort fallback when style column is missing in older DB snapshots.
        const minimalStoriesRows = await db
          .select({
            id: stories.id,
            title: stories.title,
            slug: stories.slug,
            createdAt: stories.createdAt,
          })
          .from(stories)
          .where(eq(stories.userId, userId));

        return minimalStoriesRows.map((row) => ({
          ...row,
          style: "noir",
          pageCount: null,
          coverImage: null,
          pageCreatedAt: null,
          pageUpdatedAt: null,
        }));
      }
    }
  }
}

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get all stories for the user with their pages
    const userStories = await loadStoriesWithBestEffortSchema(userId);

    // Group by story and find the max page number, first page image, and most recent update
    const storyMap = new Map<string, StoryListSummary>();

    userStories.forEach((row) => {
      const storyId = row.id;
      if (!storyMap.has(storyId)) {
        storyMap.set(storyId, {
          id: row.id,
          title: row.title,
          slug: row.slug,
          style: row.style,
          createdAt: row.createdAt,
          pageCount: 0,
          coverImage: null,
          lastUpdated: row.createdAt, // Default to story creation date
        });
      }

      const story = storyMap.get(storyId);
      if (!story) {
        return;
      }
      if (row.pageCount && row.pageCount > story.pageCount) {
        story.pageCount = row.pageCount;
      }
      if (row.pageCount === 1 && row.coverImage) {
        story.coverImage = row.coverImage;
      }
      // Track the most recent page update
      if (toTimestamp(row.pageUpdatedAt) > toTimestamp(story.lastUpdated)) {
        story.lastUpdated = row.pageUpdatedAt;
      } else if (toTimestamp(row.pageCreatedAt) > toTimestamp(story.lastUpdated)) {
        story.lastUpdated = row.pageCreatedAt;
      }
    });

    const storiesWithCovers = Array.from(storyMap.values());

    // Sort by most recently updated (stories with newest pages first)
    storiesWithCovers.sort((a, b) => {
      const aTime = toTimestamp(a.lastUpdated);
      const bTime = toTimestamp(b.lastUpdated);
      return bTime - aTime; // Most recent first
    });

    return NextResponse.json({
      stories: storiesWithCovers
    });
  } catch (error) {
    console.error("Error fetching user stories:", error);
    const inspection = inspectError(error);
    const isDatabaseUnavailable = isDatabaseUnavailableError(error);
    const detail =
      process.env.NODE_ENV === "development"
        ? error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              codes: Array.from(inspection.codes),
              causes: inspection.messages,
            }
          : { message: String(error) }
        : undefined;

    return NextResponse.json(
      {
        error: isDatabaseUnavailable
          ? "Database unavailable. Ensure Postgres is running and DATABASE_URL is reachable."
          : "Failed to fetch stories",
        ...(detail ? { detail } : {}),
      },
      { status: isDatabaseUnavailable ? 503 : 500 }
    );
  }
}
