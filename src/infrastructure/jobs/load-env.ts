/**
 * Environment loader for standalone worker scripts
 * Must be imported FIRST before any modules that use process.env
 */
import { config } from "dotenv";
import { resolve, join } from "path";
import { logger } from "@/infrastructure/logging/logger";

// Load .env files from project root
const projectRoot = resolve(__dirname, "../../..");

config({ path: join(projectRoot, ".env") });
config({ path: join(projectRoot, ".env.local"), override: true });

logger.info("Loaded .env files", { component: "env-loader", projectRoot });
logger.debug("DYNAMODB_ENDPOINT configured", {
  component: "env-loader",
  present: !!process.env.DYNAMODB_ENDPOINT,
});
