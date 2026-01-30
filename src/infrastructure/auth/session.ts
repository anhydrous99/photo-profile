import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/infrastructure/config/env";

/**
 * Session payload stored in JWT
 */
export interface SessionPayload {
  isAdmin: true;
  expiresAt: Date;
}

/**
 * Encoded secret key for JWT signing/verification
 */
const encodedKey = new TextEncoder().encode(env.AUTH_SECRET);

/**
 * Encrypt payload into JWT token
 * Uses HS256 algorithm with 8-hour expiry
 */
export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(encodedKey);
}

/**
 * Decrypt and verify JWT token
 * Returns payload if valid, null if invalid or expired
 */
export async function decrypt(session: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Create new session and set cookie
 * Session expires in 8 hours per user decision
 */
export async function createSession(): Promise<void> {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const session = await encrypt({ isAdmin: true, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set("session", session, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Delete session by clearing the cookie
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
