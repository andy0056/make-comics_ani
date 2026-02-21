import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Note: Because all generation uses the platform's API key, this ID-based limit 
// relies on Clerk's "Bot Protection" and "Email Verification" features to prevent 
// malicious actors from spinning up infinite bot accounts to bypass the limit.
// Beta: 15 comics per week (bump back to 3 after beta)
export const freeTierRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(15, "7 d"),
  analytics: true,
  prefix: "ratelimit:free-comics",
})