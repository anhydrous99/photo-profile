/**
 * UUID validation utilities
 *
 * Provides validation for UUID v4 format to prevent path traversal attacks
 * when UUIDs are used in file paths or database queries.
 */

/**
 * Regular expression for UUID v4 format validation
 *
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * - x: any hexadecimal digit (0-9, a-f)
 * - y: one of 8, 9, a, or b (variant bits)
 * - 4: version 4 identifier
 */
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate if a string is a valid UUID v4
 *
 * This validation is critical for security when UUIDs are used in file paths
 * to prevent path traversal attacks (e.g., "../../../etc/passwd").
 *
 * @param value - String to validate
 * @returns true if value is a valid UUID v4, false otherwise
 *
 * @example
 * isValidUUID("550e8400-e29b-41d4-a716-446655440000") // true
 * isValidUUID("../../../etc/passwd") // false
 * isValidUUID("not-a-uuid") // false
 */
export function isValidUUID(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

/**
 * Validate UUID and throw error if invalid
 *
 * Convenience function for validation that should halt execution on failure.
 * Use this in API routes and services where invalid UUIDs should result in errors.
 *
 * @param value - String to validate
 * @param fieldName - Name of field for error message (default: "ID")
 * @throws Error if value is not a valid UUID v4
 *
 * @example
 * assertValidUUID(photoId, "photoId") // throws if invalid
 */
export function assertValidUUID(value: string, fieldName: string = "ID"): void {
  if (!isValidUUID(value)) {
    throw new Error(`Invalid ${fieldName} format. Expected UUID v4.`);
  }
}
