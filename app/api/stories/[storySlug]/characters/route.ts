import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stories, storyCharacters } from '@/lib/schema';
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

        const characters = await db.query.storyCharacters.findMany({
            where: eq(storyCharacters.storyId, story.id),
            orderBy: (chars, { asc }) => [asc(chars.sortOrder)],
        });

        return NextResponse.json({
            characters: characters.map((c) => ({
                name: c.name,
                role: c.role || "",
                appearance: c.appearance || "",
                personality: c.personality || "",
                speechStyle: c.speechStyle || "",
                referenceImageUrl: c.referenceImageUrl || "",
                isLocked: c.isLocked
            }))
        });
    } catch (error) {
        console.error("Characters GET error:", error);
        return NextResponse.json({ error: "Failed to load characters" }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ storySlug: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const slug = (await params).storySlug;
        const { characters } = await request.json();

        const story = await db.query.stories.findFirst({
            where: eq(stories.slug, slug),
        });

        if (!story || story.userId !== userId) {
            return NextResponse.json({ error: "Not authorized to edit" }, { status: 403 });
        }

        // Replace all characters for this story
        await db.delete(storyCharacters).where(eq(storyCharacters.storyId, story.id));

        if (characters && characters.length > 0) {
            await db.insert(storyCharacters).values(
                characters.map((c: any, index: number) => ({
                    storyId: story.id,
                    name: c.name,
                    role: c.role,
                    appearance: c.appearance,
                    personality: c.personality,
                    speechStyle: c.speechStyle,
                    referenceImageUrl: c.referenceImageUrl,
                    isLocked: c.isLocked,
                    sortOrder: index,
                }))
            );
        }

        return NextResponse.json({ characters });
    } catch (error) {
        console.error("Characters PUT error:", error);
        return NextResponse.json({ error: "Failed to save characters" }, { status: 500 });
    }
}
