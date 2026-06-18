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

/**
 * MIME types accepted for video uploads (S3 multipart only).
 * MediaConvert accepts MP4 (H.264/H.265), QuickTime (.mov), and WebM inputs.
 */
export const VIDEO_UPLOAD_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

/**
 * Maps a video MIME type to the originals file extension used in the S3 key.
 */
export const VIDEO_MIME_EXTENSION: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/**
 * Maps a video file extension to its MIME type. Used to infer the content type
 * when the browser reports an empty `file.type` (happens on some OS/browser
 * combinations, notably for .mov files).
 */
export const VIDEO_EXTENSION_MIME: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/**
 * Deterministic IAM role name used by MediaConvert to read originals and write
 * HLS/poster outputs. Keep aligned with the CDK MediaConvert role.
 */
export const MEDIACONVERT_ROLE_NAME = "PhotoProfileMediaConvertRole";

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

/**
 * Maximum file size for video uploads: 2GB.
 * Videos are uploaded directly to S3 via multipart presigned URLs.
 */
export const MAX_VIDEO_FILE_SIZE = 2 * 1024 * 1024 * 1024;

/**
 * Size of each S3 multipart upload part: 64MB.
 * S3 requires parts to be at least 5MB (except the last). At 64MB a 2GB
 * upload is ~32 parts, keeping the presigned-URL count manageable.
 */
export const MULTIPART_PART_SIZE = 64 * 1024 * 1024;

/**
 * Maximum number of parts presigned in a single create request.
 * S3 allows up to 10,000 parts; this guards against absurd part counts.
 */
export const MULTIPART_MAX_PARTS = 10_000;

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
// VIDEO PROCESSING (HLS via AWS MediaConvert)
// ============================================================================

/**
 * Adaptive-bitrate HLS rendition ladder produced by MediaConvert.
 * Renditions whose height exceeds the source are skipped at job-build time so
 * we never upscale. Bitrates are conservative VBR targets (bits per second).
 */
export const HLS_RENDITIONS = [
  { height: 1080, bitrate: 5_000_000 },
  { height: 720, bitrate: 3_000_000 },
  { height: 480, bitrate: 1_500_000 },
  { height: 360, bitrate: 800_000 },
] as const;

/**
 * HLS segment length in seconds. 6s is the Apple-recommended default and
 * balances startup latency against request overhead.
 */
export const HLS_SEGMENT_SECONDS = 6;

/**
 * Storage key (relative to processed/{photoId}/) of the HLS master playlist.
 */
export const HLS_MASTER_PLAYLIST = "hls/master.m3u8";

/**
 * Storage key prefix (relative to processed/{photoId}/) for the MediaConvert
 * poster frame capture. The completion handler converts the captured JPEG into
 * the standard {width}w.webp/avif derivative set.
 */
export const VIDEO_POSTER_PREFIX = "poster";

/**
 * AAC audio bitrate (bits per second) for HLS renditions.
 */
export const HLS_AUDIO_BITRATE = 128_000;

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

/**
 * S3 multipart video presigned URL expiry in seconds.
 * Large 2GB uploads can exceed the regular 15-minute image upload window,
 * especially on slow upstream connections. All video part URLs are currently
 * presigned in one batch, so the expiry must cover the whole upload.
 */
export const VIDEO_MULTIPART_PRESIGN_EXPIRY_SECONDS = 6 * 60 * 60;

// ============================================================================
// JOB QUEUE
// ============================================================================

/**
 * Timeout for enqueue operations (SQS/Redis) in milliseconds.
 * Prevents hanging when queue services are unavailable.
 * Used in upload, confirm, and reprocess routes.
 */
export const ENQUEUE_TIMEOUT_MS = 10_000;

// ============================================================================
// ROUTE CONFIG
// ============================================================================
// HTTP CACHING
// ============================================================================

/**
 * Cache-Control header value for immutable processed image derivatives.
 * Derivatives never change (new upload = new photoId), so 1 year is safe.
 * Used in GET /api/images/[photoId]/[filename].
 */
export const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * Number of hex characters to use from MD5 hash for ETag.
 * 16 chars (64 bits) is sufficient for collision resistance.
 */
export const ETAG_HASH_LENGTH = 16;

// ============================================================================
// CACHING
// ============================================================================

/**
 * Cache tag for the published photo pool used by unstable_cache.
 * Revalidated when albums or album-photo membership change.
 */
export const PHOTO_POOL_CACHE_TAG = "published-photo-pool";
