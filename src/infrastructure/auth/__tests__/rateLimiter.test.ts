import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRatelimitInstance = vi.hoisted(() => ({
  limit: vi.fn(),
  resetUsedTokens: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => {
  const RatelimitClass = vi.fn(function () {
    return mockRatelimitInstance;
  }) as any;
  RatelimitClass.slidingWindow = vi.fn(() => ({}));
  return {
    Ratelimit: RatelimitClass,
  };
});

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(),
}));

describe("Rate Limiter (Upstash)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("checkRateLimit returns allowed: true when under limit", async () => {
    mockRatelimitInstance.limit.mockResolvedValueOnce({
      success: true,
      reset: Date.now() + 900000,
    });

    const { checkRateLimit } =
      await import("@/infrastructure/auth/rateLimiter");
    const result = await checkRateLimit("192.168.1.1");

    expect(result.allowed).toBe(true);
  });

  it("checkRateLimit returns allowed: false with retryAfter when rate limited", async () => {
    const resetTime = Date.now() + 30000; // 30 seconds from now
    mockRatelimitInstance.limit.mockResolvedValueOnce({
      success: false,
      reset: resetTime,
    });

    const { checkRateLimit } =
      await import("@/infrastructure/auth/rateLimiter");
    const result = await checkRateLimit("192.168.1.1");

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeDefined();
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("checkRateLimit returns allowed: true on Upstash error (graceful degradation)", async () => {
    mockRatelimitInstance.limit.mockRejectedValueOnce(
      new Error("Upstash connection failed"),
    );

    const { checkRateLimit } =
      await import("@/infrastructure/auth/rateLimiter");
    const result = await checkRateLimit("192.168.1.1");

    expect(result).toEqual({ allowed: true });
  });

  it("resetRateLimit calls resetUsedTokens on success", async () => {
    mockRatelimitInstance.resetUsedTokens.mockResolvedValueOnce(undefined);

    const { resetRateLimit } =
      await import("@/infrastructure/auth/rateLimiter");
    await resetRateLimit("192.168.1.1");

    expect(mockRatelimitInstance.resetUsedTokens).toHaveBeenCalledWith(
      "192.168.1.1",
    );
  });

  it("resetRateLimit silently handles Upstash errors", async () => {
    mockRatelimitInstance.resetUsedTokens.mockRejectedValueOnce(
      new Error("Upstash unavailable"),
    );

    const { resetRateLimit } =
      await import("@/infrastructure/auth/rateLimiter");
    await expect(resetRateLimit("192.168.1.1")).resolves.toBeUndefined();
    expect(mockRatelimitInstance.resetUsedTokens).toHaveBeenCalledWith(
      "192.168.1.1",
    );
  });

  it("checkRateLimit ensures retryAfter is at least 1 second", async () => {
    const resetTime = Date.now() + 100; // 100ms from now
    mockRatelimitInstance.limit.mockResolvedValueOnce({
      success: false,
      reset: resetTime,
    });

    const { checkRateLimit } =
      await import("@/infrastructure/auth/rateLimiter");
    const result = await checkRateLimit("192.168.1.1");

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });
});
