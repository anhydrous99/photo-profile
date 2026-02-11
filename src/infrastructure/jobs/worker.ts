// Load environment variables FIRST, before any other imports
import "./load-env";

import { imageWorker } from "./workers/imageProcessor";
import { logger } from "@/infrastructure/logging/logger";

logger.info("Starting image processing worker", { component: "worker" });
logger.info("Listening on queue: image-processing", { component: "worker" });

/**
 * Graceful shutdown handler
 *
 * Stops accepting new jobs and waits for current jobs to finish
 * before closing connections and exiting.
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, closing gracefully`, {
    component: "worker",
  });

  // Stop accepting new jobs, wait for current jobs to finish
  await imageWorker.close();

  logger.info("Shutdown complete", { component: "worker" });
  process.exit(0);
}

// Register shutdown handlers for clean termination
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors with graceful shutdown
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled rejection", {
    component: "worker",
    error:
      err instanceof Error ? { message: err.message, stack: err.stack } : err,
  });
  gracefulShutdown("unhandledRejection");
});
