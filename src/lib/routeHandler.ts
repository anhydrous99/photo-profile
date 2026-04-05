import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { serializeError } from "@/lib/serializeError";
import { errorResponse } from "@/lib/apiHelpers";

type RouteHandler = () => Promise<NextResponse>;

/**
 * Wrap an API route handler with standardized error handling.
 *
 * Catches any unhandled error, logs it, and returns a 500 JSON response.
 * Eliminates the repeated try/catch + logger.error + 500 pattern across routes.
 *
 * @param routeName - Identifier for log messages (e.g., "PATCH /api/admin/photos/[id]")
 * @param handler - Async route logic (already authenticated, validated)
 *
 * @example
 * export async function PATCH(request: NextRequest, context: RouteContext) {
 *   return handleRoute("PATCH /api/admin/photos/[id]", async () => {
 *     // ... route logic (no try/catch needed)
 *   });
 * }
 */
export function handleRoute(
  routeName: string,
  handler: RouteHandler,
): Promise<NextResponse> {
  return handler().catch((error: unknown) => {
    logger.error(`${routeName} failed`, {
      error: serializeError(error),
    });
    return errorResponse("Internal server error", 500);
  });
}
