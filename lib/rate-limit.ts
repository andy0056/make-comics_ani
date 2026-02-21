import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const WEEKLY_CREDIT_LIMIT = 15;
const BURST_LIMIT_PER_MINUTE = 6;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

function defaultSuccessResult(limit: number): RateLimitResult {
  return {
    success: true,
    limit,
    remaining: limit,
    reset: Date.now() + 60 * 60 * 1000,
  };
}

// Note: Because all generation uses the platform's API key, this ID-based limit
// relies on Clerk's "Bot Protection" and "Email Verification" features to prevent
// malicious actors from spinning up infinite bot accounts to bypass the limit.
// Beta: 15 comics per week (bump back to 3 after beta)
export const freeTierRateLimit =
  redis === null
    ? null
    : new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(WEEKLY_CREDIT_LIMIT, "7 d"),
        analytics: true,
        prefix: "ratelimit:free-comics",
      });

const generationBurstRateLimit =
  redis === null
    ? null
    : new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(BURST_LIMIT_PER_MINUTE, "1 m"),
        analytics: true,
        prefix: "ratelimit:generation-burst",
      });

export async function reserveGenerationCredit(userId: string): Promise<RateLimitResult> {
  if (!freeTierRateLimit) {
    return defaultSuccessResult(WEEKLY_CREDIT_LIMIT);
  }
  return freeTierRateLimit.limit(userId);
}

export async function getGenerationCreditStatus(
  userId: string,
): Promise<RateLimitResult> {
  if (!freeTierRateLimit) {
    return defaultSuccessResult(WEEKLY_CREDIT_LIMIT);
  }
  return freeTierRateLimit.getRemaining(userId);
}

export async function refundGenerationCredit(userId: string) {
  if (!freeTierRateLimit) {
    return;
  }

  try {
    await freeTierRateLimit.limit(userId, { rate: -1 });
  } catch (error) {
    console.error("Failed to refund generation credit:", error);
  }
}

export async function checkGenerationBurstLimit({
  userId,
  scope,
}: {
  userId: string;
  scope: "generate-comic" | "add-page";
}): Promise<RateLimitResult> {
  if (!generationBurstRateLimit) {
    return defaultSuccessResult(BURST_LIMIT_PER_MINUTE);
  }

  return generationBurstRateLimit.limit(`${scope}:${userId}`);
}
