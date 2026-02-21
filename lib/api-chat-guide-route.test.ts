import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  getStoryWithPagesBySlugMock,
  createCompletionMock,
  togetherConstructorMock,
  ratelimitLimitMock,
  ratelimitConstructorMock,
  ratelimitSlidingWindowMock,
  redisFromEnvMock,
} = vi.hoisted(() => {
  const createCompletion = vi.fn();
  const togetherConstructor = vi.fn(() => ({
    chat: {
      completions: {
        create: createCompletion,
      },
    },
  }));

  const limitMock = vi.fn();
  const ratelimitConstructor = vi.fn(() => ({
    limit: limitMock,
  }));
  const slidingWindowMock = vi.fn(() => "sliding-window");
  (ratelimitConstructor as unknown as { slidingWindow: typeof slidingWindowMock }).slidingWindow =
    slidingWindowMock;

  return {
    authMock: vi.fn(),
    getStoryWithPagesBySlugMock: vi.fn(),
    createCompletionMock: createCompletion,
    togetherConstructorMock: togetherConstructor,
    ratelimitLimitMock: limitMock,
    ratelimitConstructorMock: ratelimitConstructor,
    ratelimitSlidingWindowMock: slidingWindowMock,
    redisFromEnvMock: vi.fn(() => ({ mocked: true })),
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/db-actions", () => ({
  getStoryWithPagesBySlug: getStoryWithPagesBySlugMock,
}));

vi.mock("together-ai", () => ({
  default: togetherConstructorMock,
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: ratelimitConstructorMock,
}));

vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: redisFromEnvMock,
  },
}));

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/chat/guide", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.11",
    },
    body: JSON.stringify(body),
  });
}

async function loadPostRoute({ enableRatelimit = false }: { enableRatelimit?: boolean } = {}) {
  vi.resetModules();

  if (enableRatelimit) {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  } else {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }

  const module = await import("@/app/api/chat/guide/route");
  return module.POST;
}

describe("api/chat/guide route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.TOGETHER_API_KEY = "test-key";

    authMock.mockResolvedValue({ userId: "user-1" });
    getStoryWithPagesBySlugMock.mockResolvedValue(null);
    createCompletionMock.mockResolvedValue({
      choices: [{ finish_reason: "stop", message: { content: "Helpful answer." } }],
    });
    ratelimitLimitMock.mockResolvedValue({ success: true });
  });

  it("rejects unknown payload keys", async () => {
    const POST = await loadPostRoute();

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", content: "hello" }],
        debug: true,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringMatching(/unrecognized|unknown/i),
    });
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("keeps story context owner-gated for non-owners", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    const POST = await loadPostRoute();

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", content: "Next panel idea?" }],
        storySlug: "story-slug",
      }),
    );

    expect(response.status).toBe(200);
    expect(getStoryWithPagesBySlugMock).not.toHaveBeenCalled();
    const completionInput = createCompletionMock.mock.calls[0]?.[0] as
      | { messages: Array<{ role: string; content: string }> }
      | undefined;
    expect(completionInput?.messages?.[0]?.content).not.toContain(
      "[DEEP STORY CONTEXT - The user is currently editing THIS specific story]",
    );
  });

  it("includes deep story context only for authenticated owners", async () => {
    getStoryWithPagesBySlugMock.mockResolvedValueOnce({
      story: {
        title: "Neon Case",
        style: "noir",
        userId: "user-1",
      },
      pages: [
        { pageNumber: 1, prompt: "Detective finds a glowing chip in the alley." },
        { pageNumber: 2, prompt: "A shadowy figure appears behind the detective." },
      ],
    });

    const POST = await loadPostRoute();

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", content: "What should happen next?" }],
        storySlug: "story-slug",
      }),
    );

    expect(response.status).toBe(200);
    expect(getStoryWithPagesBySlugMock).toHaveBeenCalledWith("story-slug");
    const completionInput = createCompletionMock.mock.calls[0]?.[0] as
      | { messages: Array<{ role: string; content: string }> }
      | undefined;
    expect(completionInput?.messages?.[0]?.content).toContain(
      "[DEEP STORY CONTEXT - The user is currently editing THIS specific story]",
    );
    expect(completionInput?.messages?.[0]?.content).toContain("Page 1:");
  });

  it("retries once when primary generation is truncated and reports recovered meta", async () => {
    createCompletionMock
      .mockResolvedValueOnce({
        choices: [{ finish_reason: "length", message: { content: "Cut off mid sen" } }],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content:
                "Option one: The lights cut out and the detective hears footsteps behind him. Option two: A drone smashes through the window and scans the room. Option three: The chip projects a warning and the walls begin to close in.",
            },
          },
        ],
      });

    const POST = await loadPostRoute();

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", content: "Give me cliffhanger options." }],
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.meta).toEqual({
      finishReason: "stop",
      retryCount: 1,
      isTruncated: false,
      canContinue: false,
    });
    expect(createCompletionMock).toHaveBeenCalledTimes(2);
  });

  it("returns truncated meta when retry also truncates", async () => {
    createCompletionMock
      .mockResolvedValueOnce({
        choices: [{ finish_reason: "length", message: { content: "still cut" } }],
      })
      .mockResolvedValueOnce({
        choices: [{ finish_reason: "length", message: { content: "still cut again" } }],
      });

    const POST = await loadPostRoute();

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", content: "Long continuation please." }],
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.meta).toEqual({
      finishReason: "length",
      retryCount: 1,
      isTruncated: true,
      canContinue: true,
    });
    expect(createCompletionMock).toHaveBeenCalledTimes(2);
  });

  it("returns 429 when chat rate limit is exceeded", async () => {
    ratelimitLimitMock.mockResolvedValueOnce({ success: false });

    const POST = await loadPostRoute({ enableRatelimit: true });

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", content: "hello" }],
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error:
        "Whoa there, speedster! ⚡ You're sending messages too fast. Take a breath and try again in a minute.",
    });
    expect(createCompletionMock).not.toHaveBeenCalled();
    expect(redisFromEnvMock).toHaveBeenCalledTimes(1);
    expect(ratelimitSlidingWindowMock).toHaveBeenCalledWith(15, "1 m");
  });
});
