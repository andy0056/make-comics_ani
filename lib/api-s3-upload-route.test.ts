import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { authMock, s3UploadHandlerMock, configureMock, configuredHandlerMock } =
  vi.hoisted(() => {
    const configuredHandler = vi.fn();
    const s3UploadHandler = vi.fn();
    const configure = vi.fn(() => configuredHandler);
    (s3UploadHandler as { configure?: unknown }).configure = configure;

    return {
      authMock: vi.fn(),
      s3UploadHandlerMock: s3UploadHandler,
      configureMock: configure,
      configuredHandlerMock: configuredHandler,
    };
  });

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("next-s3-upload/route", () => ({
  POST: s3UploadHandlerMock,
}));

import { POST } from "@/app/api/s3-upload/route";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/s3-upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("api/s3-upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.S3_UPLOAD_KEY = "key";
    process.env.S3_UPLOAD_SECRET = "secret";
    process.env.S3_UPLOAD_BUCKET = "bucket";
    process.env.S3_UPLOAD_REGION = "us-east-1";

    authMock.mockResolvedValue({ userId: "user-1" });
    configuredHandlerMock.mockResolvedValue(
      NextResponse.json({ key: "signed-key", url: "https://example.com/upload" }),
    );
  });

  it("returns 401 for unauthenticated requests", async () => {
    authMock.mockResolvedValueOnce({ userId: null });

    const response = await POST(
      buildRequest({
        filename: "hero.png",
        filetype: "image/png",
        filesize: 1024,
        _nextS3: { strategy: "presigned" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
    expect(configureMock).not.toHaveBeenCalled();
  });

  it("rejects invalid upload payloads", async () => {
    const response = await POST(
      buildRequest({
        filename: "hero.webp",
        filetype: "image/webp",
        filesize: 1024,
        _nextS3: { strategy: "presigned" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("filetype"),
    });
    expect(configureMock).not.toHaveBeenCalled();
  });

  it("uses user-scoped object key for valid upload requests", async () => {
    const request = buildRequest({
      filename: "Hero Shot!.jpeg",
      filetype: "image/jpeg",
      filesize: 2048,
      _nextS3: { strategy: "presigned" },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      key: "signed-key",
      url: "https://example.com/upload",
    });
    expect(configureMock).toHaveBeenCalledTimes(1);
    expect(configuredHandlerMock).toHaveBeenCalledTimes(1);

    const options = configureMock.mock.calls[0]?.[0] as
      | { key?: (req: NextRequest, filename: string) => string | Promise<string> }
      | undefined;
    expect(options?.key).toBeTypeOf("function");

    const generatedKey = await options!.key!(request, "ignored");
    expect(generatedKey).toMatch(
      /^next-s3-uploads\/user-1\/\d+-[0-9a-f-]+-hero-shot\.jpg$/,
    );
  });
});
