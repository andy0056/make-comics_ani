import { NextResponse } from "next/server";
import { getStoryWithPagesBySlug } from "@/lib/db-actions";

/**
 * Public endpoint for viewing shared stories. No authentication required.
 * Returns story data and pages for read-only viewing.
 */
export async function GET(
    _request: Request,
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

        const result = await getStoryWithPagesBySlug(slug);

        if (!result) {
            return NextResponse.json({ error: "Story not found" }, { status: 404 });
        }

        // Return only safe public fields
        return NextResponse.json({
            story: {
                id: result.story.id,
                title: result.story.title,
                slug: result.story.slug,
                description: result.story.description,
                style: result.story.style,
                createdAt: result.story.createdAt,
            },
            pages: result.pages.map((page) => ({
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
