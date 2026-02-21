import { Redis } from "@upstash/redis";

const PROCESSING_TTL_SECONDS = 60 * 10;
const COMPLETED_TTL_SECONDS = 60 * 60 * 24;
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const IDEMPOTENCY_KEY_MIN_LENGTH = 8;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

type ProcessingRecord = {
  state: "processing";
  startedAt: number;
};

type CompletedRecord = {
  state: "completed";
  status: number;
  body: unknown;
  completedAt: number;
};

type IdempotencyRecord = ProcessingRecord | CompletedRecord;

export type IdempotencyToken = {
  redisKey: string;
  enabled: boolean;
};

export type IdempotencyAcquireResult =
  | { kind: "acquired"; token: IdempotencyToken }
  | { kind: "in_progress" }
  | { kind: "replay"; status: number; body: unknown };

function parseRecord(raw: string | null): IdempotencyRecord | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<IdempotencyRecord>;
    if (parsed?.state === "processing") {
      return {
        state: "processing",
        startedAt:
          typeof parsed.startedAt === "number" ? parsed.startedAt : Date.now(),
      };
    }

    if (
      parsed?.state === "completed" &&
      typeof parsed.status === "number" &&
      "body" in parsed
    ) {
      return {
        state: "completed",
        status: parsed.status,
        body: parsed.body,
        completedAt:
          typeof parsed.completedAt === "number"
            ? parsed.completedAt
            : Date.now(),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function makeRedisKey(scope: string, userId: string, idempotencyKey: string): string {
  return `idempotency:generation:${scope}:${userId}:${idempotencyKey}`;
}

export function getIdempotencyKeyFromHeaders(headers: Headers): string | null {
  const key = headers.get("x-idempotency-key")?.trim();
  if (!key) {
    return null;
  }

  if (
    key.length < IDEMPOTENCY_KEY_MIN_LENGTH ||
    key.length > IDEMPOTENCY_KEY_MAX_LENGTH ||
    !IDEMPOTENCY_KEY_PATTERN.test(key)
  ) {
    return null;
  }

  return key;
}

export async function acquireGenerationIdempotency({
  scope,
  userId,
  idempotencyKey,
}: {
  scope: string;
  userId: string;
  idempotencyKey: string | null;
}): Promise<IdempotencyAcquireResult> {
  if (!idempotencyKey || !redis) {
    return {
      kind: "acquired",
      token: {
        enabled: false,
        redisKey: "",
      },
    };
  }

  try {
    const redisKey = makeRedisKey(scope, userId, idempotencyKey);
    const existingRaw = await redis.get<string>(redisKey);
    const existing = parseRecord(existingRaw);

    if (existing?.state === "completed") {
      return {
        kind: "replay",
        status: existing.status,
        body: existing.body,
      };
    }

    if (existing?.state === "processing") {
      return { kind: "in_progress" };
    }

    const lockRecord: ProcessingRecord = {
      state: "processing",
      startedAt: Date.now(),
    };

    const lockResult = await redis.set(redisKey, JSON.stringify(lockRecord), {
      nx: true,
      ex: PROCESSING_TTL_SECONDS,
    });

    if (lockResult === "OK") {
      return {
        kind: "acquired",
        token: {
          enabled: true,
          redisKey,
        },
      };
    }

    const concurrentRaw = await redis.get<string>(redisKey);
    const concurrent = parseRecord(concurrentRaw);
    if (concurrent?.state === "completed") {
      return {
        kind: "replay",
        status: concurrent.status,
        body: concurrent.body,
      };
    }

    return { kind: "in_progress" };
  } catch (error) {
    console.error("Failed to acquire generation idempotency lock:", error);
    return {
      kind: "acquired",
      token: {
        enabled: false,
        redisKey: "",
      },
    };
  }
}

export async function completeGenerationIdempotency({
  token,
  status,
  body,
}: {
  token: IdempotencyToken;
  status: number;
  body: unknown;
}) {
  if (!token.enabled || !redis) {
    return;
  }

  try {
    const record: CompletedRecord = {
      state: "completed",
      status,
      body,
      completedAt: Date.now(),
    };

    await redis.set(token.redisKey, JSON.stringify(record), {
      ex: COMPLETED_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Failed to persist generation idempotency result:", error);
  }
}

export async function releaseGenerationIdempotency(token: IdempotencyToken) {
  if (!token.enabled || !redis) {
    return;
  }

  try {
    await redis.del(token.redisKey);
  } catch (error) {
    console.error("Failed to release generation idempotency lock:", error);
  }
}
