"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  createSession,
  verifyPassword,
  checkRateLimit,
  resetRateLimit,
  enforceMinimumDuration,
} from "@/infrastructure/auth";

/**
 * Login form validation schema
 */
const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

/**
 * State returned from login action
 */
export type LoginState = {
  error?: string;
  rateLimited?: boolean;
  retryAfter?: number;
};

/**
 * Server Action for admin login
 *
 * Handles password verification with rate limiting and timing attack prevention:
 * 1. Check rate limit first (5 attempts per 15 min)
 * 2. Validate form data
 * 3. Verify password against stored hash
 * 4. Create session and redirect on success
 *
 * All responses are enforced to take minimum 1 second to prevent timing attacks
 * that could leak information about password validity.
 */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Enforce minimum duration to prevent timing attacks
  return enforceMinimumDuration(async () => {
    // Get client IP from headers
    const headersList = await headers();
    const forwardedFor = headersList.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

    // Check rate limit first
    const rateLimitResult = await checkRateLimit(ip);
    if (!rateLimitResult.allowed) {
      return {
        error: "Too many login attempts. Please try again later.",
        rateLimited: true,
        retryAfter: rateLimitResult.retryAfter,
      };
    }

    // Validate form data
    const validatedFields = loginSchema.safeParse({
      password: formData.get("password"),
    });

    if (!validatedFields.success) {
      return { error: "Authentication failed. Please check your password." };
    }

    // Verify password
    const { password } = validatedFields.data;
    const isValid = await verifyPassword(password);

    if (!isValid) {
      return { error: "Authentication failed. Please check your password." };
    }

    // Success: create session, reset rate limit, redirect
    await createSession();
    await resetRateLimit(ip);
    redirect("/admin");
  }, 1000); // Minimum 1 second for all login attempts
}
