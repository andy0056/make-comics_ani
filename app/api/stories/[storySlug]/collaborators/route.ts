import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";
import {
  getRequestValidationErrorMessage,
  storySlugParamSchema,
} from "@/lib/api-request-validation";
import { checkStoryReadBurstLimit } from "@/lib/rate-limit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const parsedParams = storySlugParamSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: getRequestValidationErrorMessage(parsedParams.error) },
        { status: 400 },
      );
    }
    const slug = parsedParams.data.storySlug;
    const readLimit = await checkStoryReadBurstLimit({
      userId,
      scope: "collaborators",
    });
    if (!readLimit.success) {
      return NextResponse.json(
        {
          error: "Too many read requests. Please wait a moment and retry.",
          isRateLimited: true,
          resetTime: readLimit.reset,
        },
        { status: 429 },
      );
    }
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
      collaborators: [],
      access: accessResult.access,
    });
  } catch (error) {
    console.error("Collaborators GET error:", error);
    return NextResponse.json({ error: "Failed to load collaborators" }, { status: 500 });
  }
}
