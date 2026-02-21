import { type NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages, stories } from "@/lib/schema";

/**
 * Public endpoint for viewing shared stories. No authentication required.
 * Returns story data and pages for read-only viewing.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ storySlug: string }> }
) {
    try {
        const { storySlug: slug } = await params;

        if (!slug) {
            return NextResponse.json(
                { error: "Story slug is required" },
                { status: 400 }
            );
        }

        const token = request.nextUrl.searchParams.get("token")?.trim();
        if (!token) {
            return NextResponse.json({ error: "Story not found" }, { status: 404 });
        }

        const storyRows = await db
            .select()
            .from(stories)
            .where(eq(stories.slug, slug))
            .limit(1);

        const story = storyRows[0];

        if (!story || !story.isPublicShare || !story.shareToken || story.shareToken !== token) {
            return NextResponse.json({ error: "Story not found" }, { status: 404 });
        }

        const storyPages = await db
            .select()
            .from(pages)
            .where(eq(pages.storyId, story.id))
            .orderBy(asc(pages.pageNumber));

        // Return only safe public fields
        return NextResponse.json({
            story: {
                id: story.id,
                title: story.title,
                slug: story.slug,
                description: story.description,
                style: story.style,
                createdAt: story.createdAt,
            },
            pages: storyPages.map((page) => ({
                pageNumber: page.pageNumber,
                generatedImageUrl: page.generatedImageUrl,
            })),
        });
    } catch (error) {
        console.error("Error fetching shared story:", error);
        return NextResponse.json(
            { error: "Failed to load story" },
            { status: 500 }
        );
    }
}
