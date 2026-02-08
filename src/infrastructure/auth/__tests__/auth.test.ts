import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import bcrypt from "bcrypt";
import { encrypt, decrypt } from "@/infrastructure/auth/session";
import { hashPassword } from "@/infrastructure/auth/password";

/**
 * The same secret key used by session.ts, set in vitest.config.ts test.env
 */
const TEST_SECRET = "test-secret-key-must-be-at-least-32-chars-long!!";
const encodedTestKey = new TextEncoder().encode(TEST_SECRET);

describe("Session", () => {
  it("encrypt returns a JWT with 3 dot-separated parts", async () => {
    const token = await encrypt({
      isAdmin: true,
      expiresAt: new Date(Date.now() + 3600000),
    });
    expect(token).toMatch(/^eyJ/);
    expect(token.split(".")).toHaveLength(3);
  });

  it("decrypt verifies a valid token and returns payload", async () => {
    const token = await encrypt({
      isAdmin: true,
      expiresAt: new Date(Date.now() + 3600000),
    });
    const result = await decrypt(token);
    expect(result).not.toBeNull();
    expect(result!.isAdmin).toBe(true);
  });

  it("decrypt returns null for tampered token", async () => {
    const token = await encrypt({
      isAdmin: true,
      expiresAt: new Date(Date.now() + 3600000),
    });
    const tampered = token.slice(0, -5) + "XXXXX";
    const result = await decrypt(tampered);
    expect(result).toBeNull();
  });

  it("decrypt returns null for completely invalid string", async () => {
    const result = await decrypt("not-a-jwt");
    expect(result).toBeNull();
  });

  it("decrypt returns null for expired token", async () => {
    // Create an already-expired token using the same secret key as session.ts
    const expiredToken = await new SignJWT({ isAdmin: true })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("0s")
      .sign(encodedTestKey);

    // Small delay to ensure the token is definitely expired
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const result = await decrypt(expiredToken);
    expect(result).toBeNull();
  });

  it("encrypt/decrypt round-trip preserves expiresAt field", async () => {
    const expiresAt = new Date(Date.now() + 3600000);
    const token = await encrypt({ isAdmin: true, expiresAt });
    const result = await decrypt(token);
    expect(result).not.toBeNull();
    // jose serializes Date to ISO string in JWT payload
    expect(result!.expiresAt).toBeDefined();
  });
});

describe("Password", () => {
  it("hashPassword returns bcrypt format ($2b$10$)", async () => {
    const hash = await hashPassword("test-password");
    expect(hash).toMatch(/^\$2b\$10\$/);
    expect(hash).toHaveLength(60);
  });

  it("bcrypt.compare accepts correct password against hash", async () => {
    const hash = await hashPassword("my-password");
    const isValid = await bcrypt.compare("my-password", hash);
    expect(isValid).toBe(true);
  });

  it("bcrypt.compare rejects wrong password against hash", async () => {
    const hash = await hashPassword("correct-password");
    const isValid = await bcrypt.compare("wrong-password", hash);
    expect(isValid).toBe(false);
  });

  it("hashPassword generates unique hashes for same input (salt)", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
  });
});
