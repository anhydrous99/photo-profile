// Load environment variables FIRST, before any other imports
// Next.js loads .env automatically, but standalone scripts need explicit loading
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { imageWorker } from "./workers/imageProcessor";
import { imageQueue } from "./queues";

console.log("[Worker] Starting image processing worker...");
console.log("[Worker] Listening on queue: image-processing");

/**
 * Graceful shutdown handler
 *
 * Stops accepting new jobs and waits for current jobs to finish
 * before closing connections and exiting.
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[Worker] Received ${signal}, closing gracefully...`);

  // Stop accepting new jobs, wait for current jobs to finish
  await imageWorker.close();
  await imageQueue.close();

  console.log("[Worker] Shutdown complete");
  process.exit(0);
}

// Register shutdown handlers for clean termination
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors with graceful shutdown
process.on("unhandledRejection", (err) => {
  console.error("[Worker] Unhandled rejection:", err);
  gracefulShutdown("unhandledRejection");
});
