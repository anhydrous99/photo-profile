/**
 * Shared constants for the photo profile application
 * Consolidates magic numbers and inline arrays into named constants
 */

// ============================================================================
// MIME TYPES
// ============================================================================

/**
 * MIME types accepted for direct file uploads
 * Used in POST /api/admin/upload for multipart form uploads
 * Does NOT include image/heif (S3 presigned URLs only)
 */
export const UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

/**
 * MIME types accepted for S3 presigned URL uploads and confirmation
 * Includes image/heif for Wave 2 S3 direct upload feature
 * Used in POST /api/admin/upload/presign and POST /api/admin/upload/confirm
 */
export const PRESIGN_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/**
 * MIME types for serving processed image derivatives
 * Maps file extensions to Content-Type headers
 * Used in GET /api/images/[photoId]/[filename]
 */
export const SERVE_MIME_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
};

// ============================================================================
// UPLOAD LIMITS
// ============================================================================

/**
 * Maximum file size for uploads: 100MB
 * Applied to both direct uploads and S3 presigned URLs
 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * Multipart form data overhead: 5MB
 * Used to validate Content-Length header before reading request body
 */
export const MULTIPART_OVERHEAD = 5 * 1024 * 1024;

// ============================================================================
// IMAGE PROCESSING
// ============================================================================

/**
 * Derivative image widths for responsive image serving
 * Images are resized to fit within these widths while maintaining aspect ratio
 * Used in both server-side (imageService.ts) and client-side (imageLoader.ts) code
 */
export const THUMBNAIL_SIZES = [300, 600, 1200, 2400] as const;

/**
 * WebP quality setting for derivative generation
 * Range: 0-100, balances quality and file size for web delivery
 */
export const WEBP_QUALITY = 82;

/**
 * AVIF quality setting for derivative generation
 * Range: 0-100, more efficient than JPEG with better compression
 */
export const AVIF_QUALITY = 80;

/**
 * Sharp effort level for WebP encoding
 * Range: 0-6, 4 is a good middle ground between speed and compression
 */
export const WEBP_EFFORT = 4;

/**
 * Sharp effort level for AVIF encoding
 * Range: 0-9, 4 is a good middle ground between speed and compression
 */
export const AVIF_EFFORT = 4;

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * JWT session expiry duration in milliseconds
 * 8 hours = 8 * 60 * 60 * 1000 ms
 */
export const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000;

/**
 * Rate limit: 5 requests per 15 minutes (900 seconds)
 * Applied to login endpoint via Upstash Redis
 */
export const RATE_LIMIT_REQUESTS = 5;
export const RATE_LIMIT_WINDOW_SECONDS = 900;

// ============================================================================
// DYNAMODB BATCH OPERATIONS
// ============================================================================

/**
 * DynamoDB BatchWriteItem limit
 * AWS SDK enforces a maximum of 25 items per batch write request
 * Used when deleting or updating multiple photos
 */
export const DYNAMODB_BATCH_SIZE = 25;

/**
 * Batch limit multiplier for pagination queries
 * Fetches (limit + 1) * 3 items to account for filtering and pagination
 * Used in findPaginated() to ensure sufficient results after filtering
 */
export const PAGINATION_BATCH_MULTIPLIER = 3;

// ============================================================================
// S3 STORAGE
// ============================================================================

/**
 * S3 GET operation timeout in milliseconds
 * 30 seconds for retrieving files from S3
 */
export const S3_GET_TIMEOUT_MS = 30_000;

/**
 * S3 presigned URL expiry in seconds
 * 15 minutes for direct upload URLs
 */
export const S3_PRESIGN_EXPIRY_SECONDS = 15 * 60;

// ============================================================================
// CACHING
// ============================================================================

/**
 * Cache tag for the published photo pool used by unstable_cache.
 * Revalidated when albums or album-photo membership change.
 */
export const PHOTO_POOL_CACHE_TAG = "published-photo-pool";
