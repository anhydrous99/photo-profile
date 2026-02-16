import { logger } from "@/infrastructure/logging/logger";

/**
 * Enqueue job with timeout wrapper
 * Prevents hanging when Redis/SQS is unavailable
 * On failure: logs error, photo stays "processing" (manual requeue needed)
 */
export async function enqueueWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10000,
): Promise<T> {
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Job enqueue timeout")), timeoutMs),
      ),
    ]);
  } catch (error) {
    logger.error("Failed to enqueue job", {
      component: "enqueueWithTimeout",
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    throw error;
  }
}
