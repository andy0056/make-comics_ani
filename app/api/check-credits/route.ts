import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getGenerationCreditStatus } from "@/lib/rate-limit";

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const limitResult = await getGenerationCreditStatus(userId);

    return NextResponse.json({
      hasApiKey: false,
      creditsRemaining: limitResult.remaining,
      resetTime: limitResult.reset,
    });
  } catch (error) {
    console.error("Error in check-credits API:", error);
    return NextResponse.json(
      {
        error: "Internal server error.",
      },
      { status: 500 }
    );
  }
}
