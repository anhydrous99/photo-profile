import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import IORedis from "ioredis";
import { env } from "@/infrastructure/config/env";

/**
 * Redis client for rate limiting
 * - enableOfflineQueue: false to fail fast if Redis unavailable
 * - maxRetriesPerRequest: null required for rate-limiter-flexible
 */
const redisClient = new IORedis(env.REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: null,
});

/**
 * Rate limiter for login attempts
 * Configured per user decision: 5 attempts per 15 minutes
 */
const loginRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "login_fail_ip",
  points: 5, // 5 attempts allowed
  duration: 60 * 15, // Per 15 minutes
  blockDuration: 60 * 15, // Block for 15 minutes when limit exceeded
});

/**
 * Check if IP is rate limited
 * Returns allowed: true if under limit, or retryAfter in seconds if blocked
 */
export async function checkRateLimit(
  ip: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    await loginRateLimiter.consume(ip);
    return { allowed: true };
  } catch (rateLimiterRes) {
    if (rateLimiterRes instanceof Error) {
      throw rateLimiterRes;
    }
    const res = rateLimiterRes as RateLimiterRes;
    return {
      allowed: false,
      retryAfter: Math.ceil(res.msBeforeNext / 1000),
    };
  }
}

/**
 * Reset rate limit for IP after successful login
 */
export async function resetRateLimit(ip: string): Promise<void> {
  await loginRateLimiter.delete(ip);
}
