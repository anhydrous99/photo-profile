import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";

let _ratelimit: Ratelimit | undefined;

function getRatelimit(): Ratelimit {
  if (!_ratelimit) {
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    _ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "900 s"), // 5 requests per 15 minutes
    });
  }
  return _ratelimit;
}

/**
 * Check if IP is rate limited
 * Returns allowed: true if under limit, or retryAfter in seconds if blocked
 *
 * If Upstash is unavailable (development), allows request and logs warning
 */
export async function checkRateLimit(
  ip: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const { success, reset } = await getRatelimit().limit(ip);
    if (success) {
      return { allowed: true };
    }
    // Rate limit exceeded - reset is Unix timestamp in milliseconds
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return {
      allowed: false,
      retryAfter: Math.max(1, retryAfter), // Ensure at least 1 second
    };
  } catch (error) {
    // Upstash unavailable - allow request but warn
    if (error instanceof Error) {
      logger.warn("Upstash unavailable, rate limiting disabled", {
        component: "rate-limiter",
        error: error.message,
      });
    }
    return { allowed: true };
  }
}

/**
 * Reset rate limit for IP after successful login
 *
 * If Upstash is unavailable, silently continues (no-op)
 */
export async function resetRateLimit(ip: string): Promise<void> {
  try {
    await getRatelimit().resetUsedTokens(ip);
  } catch (error) {
    // Upstash unavailable - silent no-op in development
    if (error instanceof Error) {
      logger.warn("Upstash unavailable, skip reset", {
        component: "rate-limiter",
      });
    }
  }
}
