import { createHash } from "node:crypto";
import { isIP } from "node:net";

const MAX_HEADER_CHARS = 300;
const RATE_LIMIT_HASH_CHARS = 24;

function trimHeaderValue(value: string): string {
  return value.slice(0, MAX_HEADER_CHARS).trim();
}

function unwrapToken(token: string): string {
  let value = token.trim();

  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1);
  }

  // RFC 7239 obfuscated identifiers start with "_", e.g. for=_hidden
  if (value.startsWith("_")) {
    return "";
  }

  if (value.startsWith("[") && value.includes("]")) {
    const closingBracketIndex = value.indexOf("]");
    value = value.slice(1, closingBracketIndex);
  } else {
    const ipv4WithPortMatch = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPortMatch?.[1]) {
      value = ipv4WithPortMatch[1];
    }
  }

  return value.trim();
}

function normalizeIpCandidate(candidate: string): string | null {
  const token = unwrapToken(candidate);
  if (!token) {
    return null;
  }
  return isIP(token) ? token : null;
}

function getForwardedHeaderIp(forwardedHeaderValue: string): string | null {
  const entries = trimHeaderValue(forwardedHeaderValue).split(",");

  for (const entry of entries) {
    const directives = entry.split(";");
    for (const directive of directives) {
      const [rawKey, ...rawValueParts] = directive.split("=");
      if (!rawKey || rawValueParts.length === 0) {
        continue;
      }

      if (rawKey.trim().toLowerCase() !== "for") {
        continue;
      }

      const rawValue = rawValueParts.join("=").trim();
      const normalized = normalizeIpCandidate(rawValue);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

export function getClientIpFromHeaders(headers: Headers): string | null {
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    const normalized = normalizeIpCandidate(trimHeaderValue(cfConnectingIp));
    if (normalized) {
      return normalized;
    }
  }

  const xRealIp = headers.get("x-real-ip");
  if (xRealIp) {
    const normalized = normalizeIpCandidate(trimHeaderValue(xRealIp));
    if (normalized) {
      return normalized;
    }
  }

  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstHop = trimHeaderValue(xForwardedFor).split(",")[0]?.trim();
    if (firstHop) {
      const normalized = normalizeIpCandidate(firstHop);
      if (normalized) {
        return normalized;
      }
    }
  }

  const forwarded = headers.get("forwarded");
  if (forwarded) {
    const normalized = getForwardedHeaderIp(forwarded);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function hashRateLimitIdentifier(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, RATE_LIMIT_HASH_CHARS);
}

export function buildChatRateLimitKey({
  headers,
  userId,
}: {
  headers: Headers;
  userId: string | null | undefined;
}): string {
  const normalizedUserId = userId?.trim();
  if (normalizedUserId) {
    return `chat:user:${normalizedUserId}`;
  }

  const clientIp = getClientIpFromHeaders(headers);
  if (clientIp) {
    return `chat:anon:${hashRateLimitIdentifier(`ip:${clientIp}`)}`;
  }

  const userAgentSeed = headers.get("user-agent")?.slice(0, 120).trim() || "unknown";
  return `chat:anon:${hashRateLimitIdentifier(`ua:${userAgentSeed}`)}`;
}
