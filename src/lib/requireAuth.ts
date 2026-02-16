import { NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";

/**
 * Verify admin authentication for API route handlers.
 *
 * Returns the session on success, or a 401 NextResponse on failure.
 * Internally calls verifySession() so existing test mocks continue to work.
 *
 * @example
 *   const authResult = await requireAuth();
 *   if (authResult instanceof NextResponse) return authResult;
 */
export async function requireAuth() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}
