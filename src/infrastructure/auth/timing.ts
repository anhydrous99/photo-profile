/**
 * Timing attack prevention utilities
 *
 * Provides functions to enforce minimum execution duration to prevent
 * timing-based side-channel attacks that could leak authentication information.
 */

/**
 * Enforce minimum duration for an async operation
 *
 * This prevents timing attacks by ensuring that operations always take
 * at least a minimum amount of time, regardless of when they complete.
 * This is critical for authentication flows where timing differences
 * could reveal information about password validity.
 *
 * @param fn - Async function to execute
 * @param minMs - Minimum duration in milliseconds (default: 1000ms)
 * @returns Promise resolving to the function's return value
 *
 * @example
 * // Ensure login always takes at least 1 second
 * const result = await enforceMinimumDuration(async () => {
 *   return await checkPassword(password);
 * }, 1000);
 */
export async function enforceMinimumDuration<T>(
  fn: () => Promise<T>,
  minMs: number = 1000,
): Promise<T> {
  const startTime = Date.now();

  try {
    // Execute the function
    const result = await fn();

    // Calculate remaining time to reach minimum duration
    const elapsed = Date.now() - startTime;
    const remaining = minMs - elapsed;

    // If we finished too quickly, delay to reach minimum duration
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    return result;
  } catch (error) {
    // Even if the function throws, enforce minimum duration
    const elapsed = Date.now() - startTime;
    const remaining = minMs - elapsed;

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    // Re-throw the error after enforcing timing
    throw error;
  }
}

/**
 * Add random jitter to execution time
 *
 * Adds a small random delay to make timing attacks statistically harder.
 * This provides defense in depth when combined with minimum duration enforcement.
 *
 * @param maxJitterMs - Maximum jitter in milliseconds (default: 100ms)
 * @returns Promise that resolves after random delay
 *
 * @example
 * await enforceMinimumDuration(async () => {
 *   const result = await authenticate();
 *   await addRandomJitter(50); // Add 0-50ms random delay
 *   return result;
 * }, 1000);
 */
export async function addRandomJitter(
  maxJitterMs: number = 100,
): Promise<void> {
  const jitter = Math.random() * maxJitterMs;
  await new Promise((resolve) => setTimeout(resolve, jitter));
}
