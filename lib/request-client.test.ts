import { describe, expect, it } from "vitest";
import {
  buildChatRateLimitKey,
  getClientIpFromHeaders,
} from "@/lib/request-client";

describe("request-client", () => {
  describe("getClientIpFromHeaders", () => {
    it("prefers cf-connecting-ip when valid", () => {
      const headers = new Headers({
        "cf-connecting-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.9",
      });

      expect(getClientIpFromHeaders(headers)).toBe("203.0.113.10");
    });

    it("uses first x-forwarded-for hop and strips port", () => {
      const headers = new Headers({
        "x-forwarded-for": "198.51.100.9:443, 10.0.0.1",
      });

      expect(getClientIpFromHeaders(headers)).toBe("198.51.100.9");
    });

    it("parses forwarded header for ipv6", () => {
      const headers = new Headers({
        forwarded: 'for="[2001:db8:cafe::17]:4711";proto=https',
      });

      expect(getClientIpFromHeaders(headers)).toBe("2001:db8:cafe::17");
    });

    it("returns null for invalid values", () => {
      const headers = new Headers({
        "x-forwarded-for": "malformed-ip",
        forwarded: "for=_hidden",
      });

      expect(getClientIpFromHeaders(headers)).toBeNull();
    });
  });

  describe("buildChatRateLimitKey", () => {
    it("uses authenticated user key when present", () => {
      const key = buildChatRateLimitKey({
        headers: new Headers({ "x-forwarded-for": "198.51.100.9" }),
        userId: "user_123",
      });

      expect(key).toBe("chat:user:user_123");
    });

    it("builds a stable anonymous key from client ip", () => {
      const headers = new Headers({ "x-forwarded-for": "198.51.100.9" });
      const keyA = buildChatRateLimitKey({ headers, userId: null });
      const keyB = buildChatRateLimitKey({ headers, userId: null });

      expect(keyA).toBe(keyB);
      expect(keyA).toMatch(/^chat:anon:[a-f0-9]{24}$/);
    });

    it("falls back to user-agent hash when ip is unavailable", () => {
      const key = buildChatRateLimitKey({
        headers: new Headers({ "user-agent": "Mozilla/5.0 TestAgent" }),
        userId: null,
      });

      expect(key).toMatch(/^chat:anon:[a-f0-9]{24}$/);
    });
  });
});
