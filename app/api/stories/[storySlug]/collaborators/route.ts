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

        const isOwner = story.userId === userId;

        return NextResponse.json({
            collaborators: [],
            access: {
                isOwner,
                role: isOwner ? "owner" : "viewer",
                canView: true,
                canEdit: isOwner,
                canManage: isOwner,
            }
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to load collaborators" }, { status: 500 });
    }
}
