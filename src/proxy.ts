import { NextRequest, NextResponse } from "next/server";

/**
 * Route protection proxy (Next.js 16 proxy.ts)
 *
 * Runs on Edge runtime for all /admin/* routes.
 * Only checks cookie EXISTENCE - full JWT verification
 * happens in protected layout Server Component.
 *
 * Per user decision: unauthenticated access returns 404
 * to hide admin panel existence.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Only apply to /admin/* routes (except login)
  if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
    const session = request.cookies.get("session")?.value;

    // No session cookie = 404 (hide admin existence per CONTEXT.md)
    if (!session) {
      return new NextResponse("Not found", { status: 404 });
    }
    // Note: Don't verify JWT here - keep proxy lightweight per research
    // Full verification happens in protected layout Server Component
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
