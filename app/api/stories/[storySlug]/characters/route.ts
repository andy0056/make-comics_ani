import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { storyCharacters } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

type CharacterPayload = {
  name: string;
  role?: string;
  appearance?: string;
  personality?: string;
  speechStyle?: string;
  referenceImageUrl?: string;
  isLocked?: boolean;
};

function normalizeCharactersInput(value: unknown): CharacterPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is CharacterPayload => typeof item === "object" && item !== null)
    .map((item) => ({
      name: typeof item.name === "string" ? item.name.trim() : "",
      role: typeof item.role === "string" ? item.role : "",
      appearance: typeof item.appearance === "string" ? item.appearance : "",
      personality: typeof item.personality === "string" ? item.personality : "",
      speechStyle: typeof item.speechStyle === "string" ? item.speechStyle : "",
      referenceImageUrl:
        typeof item.referenceImageUrl === "string" ? item.referenceImageUrl : "",
      isLocked: typeof item.isLocked === "boolean" ? item.isLocked : true,
    }))
    .filter((item) => item.name.length > 0);
}

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

    const characters = await db
      .select()
      .from(storyCharacters)
      .where(eq(storyCharacters.storyId, accessResult.story.id))
      .orderBy(storyCharacters.sortOrder);

    return NextResponse.json({
      characters: characters.map((c) => ({
        name: c.name,
        role: c.role || "",
        appearance: c.appearance || "",
        personality: c.personality || "",
        speechStyle: c.speechStyle || "",
        referenceImageUrl: c.referenceImageUrl || "",
        isLocked: c.isLocked,
      })),
      access: accessResult.access,
    });
  } catch (error) {
    console.error("Characters GET error:", error);
    return NextResponse.json({ error: "Failed to load characters" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
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
      requiredPermission: "edit",
      unauthorizedMode: "unauthorized",
    });

    if (!accessResult.ok) {
      return NextResponse.json(
        { error: accessResult.error },
        { status: accessResult.status },
      );
    }

    const body = await request.json();
    const characters = normalizeCharactersInput(body?.characters);

    await db
      .delete(storyCharacters)
      .where(eq(storyCharacters.storyId, accessResult.story.id));

    if (characters.length > 0) {
      await db.insert(storyCharacters).values(
        characters.map((c, index) => ({
          storyId: accessResult.story.id,
          name: c.name,
          role: c.role || "",
          appearance: c.appearance || "",
          personality: c.personality || "",
          speechStyle: c.speechStyle || "",
          referenceImageUrl: c.referenceImageUrl || "",
          isLocked: c.isLocked ?? true,
          sortOrder: index,
        })),
      );
    }

    return NextResponse.json({ characters });
  } catch (error) {
    console.error("Characters PUT error:", error);
    return NextResponse.json({ error: "Failed to save characters" }, { status: 500 });
  }
}
