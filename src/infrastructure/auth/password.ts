import "server-only";
import bcrypt from "bcrypt";
import { env } from "@/infrastructure/config/env";

/**
 * Verify password against stored admin hash
 * Uses async bcrypt comparison to avoid blocking event loop
 */
export async function verifyPassword(password: string): Promise<boolean> {
  return bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);
}

/**
 * Hash a password using bcrypt
 * Cost factor of 10 balances security and performance
 * Used by scripts/hash-password.ts to generate ADMIN_PASSWORD_HASH
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
