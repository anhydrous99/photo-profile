/**
 * Environment loader for standalone worker scripts
 * Must be imported FIRST before any modules that use process.env
 */
import { config } from "dotenv";
import { resolve, join } from "path";

// Load .env files from project root
const projectRoot = resolve(__dirname, "../../..");

config({ path: join(projectRoot, ".env") });
config({ path: join(projectRoot, ".env.local"), override: true });

console.log("[EnvLoader] Loaded .env files from:", projectRoot);
console.log(
  "[EnvLoader] DATABASE_PATH:",
  process.env.DATABASE_PATH ? "✓" : "✗",
);
