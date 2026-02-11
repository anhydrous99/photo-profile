import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import IORedis from "ioredis";
import { env } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";

let _redisClient: IORedis | undefined;
let _loginRateLimiter: RateLimiterRedis | undefined;

function getRedisClient(): IORedis {
  if (!_redisClient) {
    _redisClient = new IORedis(env.REDIS_URL, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
    });
  }
  return _redisClient;
}

function getLoginRateLimiter(): RateLimiterRedis {
  if (!_loginRateLimiter) {
    _loginRateLimiter = new RateLimiterRedis({
      storeClient: getRedisClient(),
      keyPrefix: "login_fail_ip",
      points: 5,
      duration: 60 * 15,
      blockDuration: 60 * 15,
    });
  }
  return _loginRateLimiter;
}

/**
 * Check if IP is rate limited
 * Returns allowed: true if under limit, or retryAfter in seconds if blocked
 *
 * If Redis is unavailable (development), allows request and logs warning
 */
export async function checkRateLimit(
  ip: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    await getLoginRateLimiter().consume(ip);
    return { allowed: true };
  } catch (rateLimiterRes) {
    // Redis connection error - allow request but warn
    if (rateLimiterRes instanceof Error) {
      logger.warn("Redis unavailable, rate limiting disabled", {
        component: "rate-limiter",
        error: rateLimiterRes.message,
      });
      return { allowed: true };
    }
    // Rate limit exceeded
    const res = rateLimiterRes as RateLimiterRes;
    return {
      allowed: false,
      retryAfter: Math.ceil(res.msBeforeNext / 1000),
    };
  }
}

/**
 * Reset rate limit for IP after successful login
 *
 * If Redis is unavailable, silently continues (no-op)
 */
export async function resetRateLimit(ip: string): Promise<void> {
  try {
    await getLoginRateLimiter().delete(ip);
  } catch (error) {
    // Redis unavailable - silent no-op in development
    if (error instanceof Error) {
      logger.warn("Redis unavailable, skip reset", {
        component: "rate-limiter",
      });
    }
  }
}
