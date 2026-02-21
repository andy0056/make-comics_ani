import { describe, expect, it } from "vitest";
import { getIdempotencyKeyFromHeaders } from "@/lib/generation-idempotency";

describe("generation idempotency header parsing", () => {
  it("accepts valid keys", () => {
    const headers = new Headers({
      "x-idempotency-key": "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(getIdempotencyKeyFromHeaders(headers)).toBe(
      "123e4567-e89b-12d3-a456-426614174000",
    );
  });

  it("rejects missing, short, and malformed keys", () => {
    expect(getIdempotencyKeyFromHeaders(new Headers())).toBeNull();
    expect(
      getIdempotencyKeyFromHeaders(
        new Headers({ "x-idempotency-key": "short" }),
      ),
    ).toBeNull();
    expect(
      getIdempotencyKeyFromHeaders(
        new Headers({ "x-idempotency-key": "bad key with spaces" }),
      ),
    ).toBeNull();
    expect(
      getIdempotencyKeyFromHeaders(
        new Headers({ "x-idempotency-key": "invalid@identifier-12345678" }),
      ),
    ).toBeNull();
  });
});
