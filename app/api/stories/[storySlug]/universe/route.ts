import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stories } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ storySlug: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const slug = (await params).storySlug;
        const story = await db.query.stories.findFirst({
            where: eq(stories.slug, slug),
        });

        if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

        const now = new Date().toISOString();

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
                    }
                ],
                edges: [],
            }
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to load universe" }, { status: 500 });
    }
}
