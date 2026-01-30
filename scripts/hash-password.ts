/**
 * One-time password hash generation script
 *
 * Usage: npx tsx scripts/hash-password.ts <password>
 *
 * Generates a bcrypt hash suitable for ADMIN_PASSWORD_HASH env var
 */
import bcrypt from "bcrypt";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npx tsx scripts/hash-password.ts <password>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
console.log("\nAdd to .env:");
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
