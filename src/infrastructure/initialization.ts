/**
 * Application initialization module
 * Runs once at app startup to set up required infrastructure
 */

import { createTables } from "./database/dynamodb/tables";
import { logger } from "./logging/logger";

let initialized = false;

/**
 * Initialize application infrastructure
 * - Creates DynamoDB tables (idempotent)
 * Safe to call multiple times
 */
export async function initializeApp(): Promise<void> {
  if (initialized) {
    return;
  }

  try {
    logger.info("Initializing application infrastructure", {
      component: "initialization",
    });

    // Create DynamoDB tables (idempotent - safe to call on every startup)
    await createTables();

    logger.info("Application initialization complete", {
      component: "initialization",
    });

    initialized = true;
  } catch (error) {
    logger.error("Application initialization failed", {
      component: "initialization",
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    throw error;
  }
}
