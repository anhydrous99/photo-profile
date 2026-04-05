import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/requireAuth";

// ============================================================================
// Auth Helper
// ============================================================================

/**
 * Wrap an async handler with admin authentication.
 *
 * Eliminates the repeated pattern:
 * ```
 * const authResult = await requireAuth();
 * if (authResult instanceof NextResponse) return authResult;
 * ```
 *
 * @param handler - Async function to run after successful auth
 * @returns 401 NextResponse if unauthenticated, otherwise handler result
 */
export async function withAuth<T>(
  handler: () => Promise<T>,
): Promise<T | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  return handler();
}

// ============================================================================
// Validation Helpers
// ============================================================================

type ValidationResult<T> =
  | { data: T; error: null }
  | { data: null; error: NextResponse };

/**
 * Validate request body against a Zod schema.
 *
 * Returns a discriminated union:
 * - `{ data, error: null }` on success
 * - `{ data: null, error }` with 400 NextResponse on failure
 *
 * @example
 * const result = await validateBody(schema, body);
 * if (result.error) return result.error;
 * const { photoId } = result.data;
 */
export function validateBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
): ValidationResult<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      data: null,
      error: NextResponse.json(
        {
          error: "Validation failed",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 },
      ),
    };
  }
  return { data: parsed.data, error: null };
}

/**
 * Validate a route parameter as a UUID.
 *
 * Returns the validated ID or a 400 NextResponse with a consistent error shape.
 *
 * @example
 * const idError = validateParamId(id, "photo");
 * if (idError) return idError;
 */
export function validateParamId(
  id: string,
  label: string,
): NextResponse | null {
  const schema = z.string().uuid(`Invalid ${label} ID format`);
  const result = schema.safeParse(id);
  if (!result.success) {
    return NextResponse.json(
      { error: `Invalid ${label} ID format` },
      { status: 400 },
    );
  }
  return null;
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Create a JSON error response with consistent envelope.
 *
 * All error responses use: `{ error: string }`
 * Validation errors add: `{ error: string, details: Record<string, string[]> }`
 */
export function errorResponse(
  message: string,
  status: number = 500,
): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Create a JSON success response.
 */
export function successResponse(
  data: unknown,
  status: number = 200,
): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Create a 204 No Content response (for DELETE operations).
 */
export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

// ============================================================================
// Cache Headers
// ============================================================================

/**
 * Cache headers for immutable processed image derivatives.
 * 1 year — derivatives never change (new upload = new photoId).
 */
export const CACHE_HEADERS_IMMUTABLE: Record<string, string> = {
  "Cache-Control": "public, max-age=31536000, immutable",
};
