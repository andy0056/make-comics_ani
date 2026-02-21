import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { freeTierRateLimit } from "@/lib/rate-limit";

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Enforce rate limits universally (no API key bypass)
    // For free tier, check rate limit status via Redis
    const limitResult = await freeTierRateLimit.getRemaining(userId);

    return NextResponse.json({
      hasApiKey: false,
      creditsRemaining: limitResult.remaining,
      resetTime: limitResult.reset,
    });
  } catch (error) {
    console.error("Error in check-credits API:", error);
    return NextResponse.json(
      {
        error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"
          }`,
      },
      { status: 500 }
    );
  }
}
