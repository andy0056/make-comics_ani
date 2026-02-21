import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getGenerationCreditStatusMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getGenerationCreditStatusMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  getGenerationCreditStatus: getGenerationCreditStatusMock,
}));

import { POST } from "@/app/api/check-credits/route";

describe("api/check-credits route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ userId: "user-1" });
    getGenerationCreditStatusMock.mockResolvedValue({
      success: true,
      limit: 15,
      remaining: 11,
      reset: 123456,
    });
  });

  it("requires authentication", async () => {
    authMock.mockResolvedValueOnce({ userId: null });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
    expect(getGenerationCreditStatusMock).not.toHaveBeenCalled();
  });

  it("returns current remaining credits", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      hasApiKey: false,
      creditsRemaining: 11,
      resetTime: 123456,
    });
    expect(getGenerationCreditStatusMock).toHaveBeenCalledWith("user-1");
  });

  it("returns generic 500 when credit lookup fails", async () => {
    getGenerationCreditStatusMock.mockRejectedValueOnce(new Error("redis down"));

    const response = await POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Internal server error.",
    });
  });
});
