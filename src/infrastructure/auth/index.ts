/**
 * Auth infrastructure barrel export
 *
 * Centralizes all authentication-related utilities:
 * - Session: JWT encrypt/decrypt and cookie management
 * - Password: Bcrypt hashing and verification
 * - Rate Limiter: Login attempt limiting
 * - DAL: Data Access Layer for session verification
 * - Timing: Timing attack prevention utilities
 * - IP Extraction: Secure client IP extraction with spoofing protection
 */

// Session management
export { encrypt, decrypt, createSession, deleteSession } from "./session";
export type { SessionPayload } from "./session";

// Password utilities
export { verifyPassword, hashPassword } from "./password";

// Rate limiting
export { checkRateLimit, resetRateLimit } from "./rateLimiter";

// Data Access Layer
export { verifySession } from "./dal";

// Timing attack prevention
export { enforceMinimumDuration, addRandomJitter } from "./timing";

// IP extraction
export { getClientIP, getClientIPSimple } from "./ipExtractor";
