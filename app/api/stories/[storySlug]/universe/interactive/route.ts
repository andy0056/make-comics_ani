import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";
import {
  getRequestValidationErrorMessage,
  storySlugParamSchema,
} from "@/lib/api-request-validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedParams = storySlugParamSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: getRequestValidationErrorMessage(parsedParams.error) },
        { status: 400 },
      );
    }
    const slug = parsedParams.data.storySlug;
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
      interactive: null,
      access: accessResult.access,
    });
  } catch (error) {
    console.error("Universe interactive GET error:", error);
    return NextResponse.json({ error: "Failed to load interactive universe" }, { status: 500 });
  }
}
