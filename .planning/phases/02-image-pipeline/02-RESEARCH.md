# Phase 2: Image Pipeline - Research

**Researched:** 2026-01-29
**Domain:** Image processing, async job queues, format optimization
**Confidence:** HIGH

## Summary

This phase implements automatic image processing for a photography portfolio. The research focused on three core areas: high-performance image processing with Sharp, reliable async job queuing with BullMQ and Redis, and format optimization strategies for web delivery.

The standard approach is well-established: Sharp (built on libvips) is the definitive choice for Node.js image processing, offering 4-5x faster performance than ImageMagick and excellent memory efficiency through streaming. BullMQ provides a modern, TypeScript-first job queue with robust retry logic, built on Redis Streams for reliability. For format strategy, the research recommends generating WebP alongside JPEG, with AVIF as optional given its slower encoding and the quality vs. speed tradeoffs for a personal portfolio.

Key recommendations include: use Sharp's `rotate()` for auto-orientation, preserve sRGB color space for web delivery, configure exponential backoff for retries, limit worker concurrency to prevent resource exhaustion, and store derivatives in a structured directory hierarchy separate from originals.

**Primary recommendation:** Use Sharp v0.34.5 with BullMQ v5.66.x, generate WebP + JPEG at 4 thumbnail sizes (300/600/1200/2400px), preserve color accuracy with sRGB output and `withMetadata()`.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library                                     | Version | Purpose                                     | Why Standard                                                                             |
| ------------------------------------------- | ------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [sharp](https://sharp.pixelplumbing.com/)   | 0.34.5  | Image resizing, format conversion, metadata | 4-5x faster than ImageMagick, streams images efficiently, handles ICC profiles correctly |
| [bullmq](https://bullmq.io/)                | 5.66.x  | Job queue for async processing              | TypeScript-first, Redis Streams-based, robust retry/backoff, used by Microsoft           |
| [ioredis](https://github.com/redis/ioredis) | 5.x     | Redis client for BullMQ                     | Required by BullMQ, supports cluster mode, better reconnection                           |

### Supporting

| Library                                                        | Version | Purpose                        | When to Use                               |
| -------------------------------------------------------------- | ------- | ------------------------------ | ----------------------------------------- |
| [@bull-board/api](https://github.com/felixmosh/bull-board)     | 6.16.x  | Queue monitoring dashboard     | Development/debugging, viewing job status |
| [@bull-board/express](https://github.com/felixmosh/bull-board) | 6.16.x  | Express adapter for Bull Board | Mounting dashboard in development         |

### Alternatives Considered

| Instead of | Could Use   | Tradeoff                                                 |
| ---------- | ----------- | -------------------------------------------------------- |
| Sharp      | Jimp        | Pure JS (no native deps) but 10-15x slower, no WebP/AVIF |
| Sharp      | ImageMagick | More formats supported but 4-5x slower                   |
| BullMQ     | Agenda      | MongoDB-based, simpler but less robust                   |
| BullMQ     | pg-boss     | PostgreSQL-based, fewer features                         |

**Installation:**

```bash
npm install sharp bullmq ioredis
npm install -D @bull-board/api @bull-board/express @types/ioredis
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── infrastructure/
│   ├── jobs/
│   │   ├── queues.ts           # Queue definitions and configuration
│   │   ├── workers/
│   │   │   └── imageProcessor.ts  # Image processing worker
│   │   └── index.ts
│   └── services/
│       └── imageService.ts     # Sharp operations wrapper
├── domain/
│   └── entities/
│       └── Photo.ts            # (existing) Photo entity with status
storage/
├── originals/                  # Untouched uploaded files
│   └── {photoId}.{ext}
└── derivatives/                # Generated thumbnails/formats
    └── {photoId}/
        ├── 300w.webp
        ├── 300w.jpg
        ├── 600w.webp
        ├── 600w.jpg
        ├── 1200w.webp
        ├── 1200w.jpg
        ├── 2400w.webp
        └── 2400w.jpg
```

### Pattern 1: Job-Based Image Processing Pipeline

**What:** Decouple upload from processing using async jobs. Upload stores original, creates job, worker generates derivatives.

**When to use:** Always for image processing - prevents request timeout, enables retry, allows concurrent processing.

**Example:**

```typescript
// Source: BullMQ docs + Sharp docs
import { Queue, Worker, Job } from "bullmq";
import sharp from "sharp";
import IORedis from "ioredis";

// Queue definition
const connection = new IORedis({
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
});

const imageQueue = new Queue("image-processing", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// Add job after upload
await imageQueue.add("process-image", {
  photoId: "uuid-here",
  originalPath: "/storage/originals/uuid-here.jpg",
});
```

### Pattern 2: Sharp Processing Chain

**What:** Chain Sharp operations for efficient single-pass processing with proper color management.

**When to use:** Every thumbnail generation operation.

**Example:**

```typescript
// Source: Sharp official docs
import sharp from "sharp";

const THUMBNAIL_SIZES = [300, 600, 1200, 2400] as const;

async function generateDerivatives(
  inputPath: string,
  outputDir: string,
): Promise<void> {
  // Read original once, get metadata
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  for (const width of THUMBNAIL_SIZES) {
    // Skip if original is smaller than target
    if (metadata.width && metadata.width < width) continue;

    const pipeline = sharp(inputPath)
      .rotate() // Auto-orient from EXIF
      .resize(width, null, {
        fit: "inside",
        withoutEnlargement: true,
        kernel: "lanczos3",
      })
      .withMetadata(); // Preserve sRGB ICC profile

    // Generate WebP
    await pipeline
      .clone()
      .webp({ quality: 82, effort: 4 })
      .toFile(`${outputDir}/${width}w.webp`);

    // Generate JPEG
    await pipeline
      .clone()
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(`${outputDir}/${width}w.jpg`);
  }
}
```

### Pattern 3: Worker with Concurrency Control

**What:** Limit concurrent image processing to prevent memory/CPU exhaustion.

**When to use:** Production worker configuration.

**Example:**

```typescript
// Source: BullMQ docs
import { Worker, Job } from "bullmq";

const worker = new Worker(
  "image-processing",
  async (job: Job) => {
    const { photoId, originalPath } = job.data;

    // Update progress for monitoring
    await job.updateProgress(10);

    // Generate all derivatives
    await generateDerivatives(originalPath, `/storage/derivatives/${photoId}`);

    await job.updateProgress(100);

    return { photoId, success: true };
  },
  {
    connection,
    concurrency: 2, // Limit to 2 concurrent jobs (adjust based on server)
    limiter: {
      max: 10,
      duration: 60000, // Max 10 jobs per minute
    },
  },
);

// CRITICAL: Always attach error handler
worker.on("error", (err) => {
  console.error("Worker error:", err);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
  // Update photo status to 'error' in database
});

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
  // Update photo status to 'ready' in database
});
```

### Anti-Patterns to Avoid

- **Processing in request handler:** Never process images synchronously in upload endpoint - will timeout for large images
- **Unbounded concurrency:** Don't run unlimited parallel jobs - will exhaust memory with 50MP images
- **Ignoring EXIF orientation:** Always call `.rotate()` before resize - images will appear rotated otherwise
- **Stripping all metadata:** Use `withMetadata()` to preserve ICC profile - colors will shift without sRGB profile
- **Not handling partial failures:** If WebP succeeds but JPEG fails, have retry logic that resumes from failure point

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem           | Don't Build                       | Use Instead                       | Why                                                  |
| ----------------- | --------------------------------- | --------------------------------- | ---------------------------------------------------- |
| Image resizing    | Custom ffmpeg/ImageMagick wrapper | Sharp                             | Native bindings, streaming, handles ICC profiles     |
| Job retry logic   | Custom retry timers               | BullMQ backoff                    | Handles edge cases, persistence, distributed workers |
| EXIF orientation  | Manual rotation calculation       | `sharp().rotate()`                | 8 orientation cases, mirroring, complex logic        |
| Color management  | Manual ICC parsing                | Sharp withMetadata()              | ICC profile handling is extremely complex            |
| Queue persistence | Database polling                  | BullMQ + Redis                    | Redis Streams are purpose-built for this             |
| Progressive JPEG  | Manual scan ordering              | `sharp().jpeg({ mozjpeg: true })` | MozJPEG handles this optimally                       |

**Key insight:** Image processing and color management have decades of edge cases. Libraries like Sharp/libvips encode this knowledge. Hand-rolling leads to subtle bugs (wrong colors, rotated images, memory leaks with large files).

## Common Pitfalls

### Pitfall 1: Memory Exhaustion with Large Images

**What goes wrong:** 50MP images (8000x6000) consume ~144MB uncompressed. Processing multiple concurrently causes OOM.

**Why it happens:** Default Sharp behavior loads entire image into memory. High concurrency multiplies memory usage.

**How to avoid:**

- Set `concurrency: 2` on worker (or lower for limited-memory servers)
- Use `sharp.cache(false)` in long-running workers to disable operation caching
- Consider `sharp.limitInputPixels(100 * 1000 * 1000)` to reject extremely large inputs

**Warning signs:** Worker crashes without error, Node process killed by OS, server becomes unresponsive.

### Pitfall 2: Wrong EXIF Orientation

**What goes wrong:** Thumbnails appear rotated 90/180 degrees compared to original.

**Why it happens:** Camera stores orientation in EXIF, not actual pixels. Browser interprets EXIF, Sharp doesn't by default.

**How to avoid:** Always call `.rotate()` without arguments before any resize. This reads EXIF orientation and applies it.

**Warning signs:** Portrait photos appearing landscape, images appearing upside down.

### Pitfall 3: Color Shift in Output

**What goes wrong:** Colors look washed out or different from original in generated thumbnails.

**Why it happens:** Original has embedded ICC profile (Adobe RGB, ProPhoto RGB). Without conversion, browsers assume sRGB.

**How to avoid:** Use `withMetadata()` which auto-converts to sRGB and embeds the profile. Never strip metadata completely.

**Warning signs:** Vibrant originals look dull in thumbnails, skin tones appear wrong.

### Pitfall 4: Missing Worker Error Handler

**What goes wrong:** Worker stops processing jobs silently.

**Why it happens:** BullMQ workers emit error events. Without handler, Node.js may exit or stop accepting new jobs.

**How to avoid:** Always attach `worker.on('error', handler)`. Log errors and consider alerting.

**Warning signs:** Jobs stuck in "waiting" state, worker process running but not processing.

### Pitfall 5: Redis maxmemory-policy Not Set

**What goes wrong:** Random jobs disappear, queue state becomes corrupted.

**Why it happens:** Default Redis evicts keys when memory full. BullMQ requires all keys to persist.

**How to avoid:** Set `maxmemory-policy noeviction` in Redis config. The docker-compose already uses `appendonly yes` which helps, but explicitly set the policy.

**Warning signs:** Jobs vanishing, inconsistent queue counts, Lua script errors.

### Pitfall 6: Generating Derivatives Larger Than Original

**What goes wrong:** Thumbnails are larger than original or upscaled, wasting storage and bandwidth.

**Why it happens:** Original image smaller than target size (e.g., 800px photo getting 1200px "thumbnail").

**How to avoid:** Use `withoutEnlargement: true` in resize options. Check original dimensions and skip sizes larger than original.

**Warning signs:** "Thumbnails" with larger file size than original, blurry enlarged images.

## Code Examples

Verified patterns from official sources:

### Complete Worker Implementation

```typescript
// Source: BullMQ docs + Sharp docs
// src/infrastructure/jobs/workers/imageProcessor.ts

import { Worker, Job } from "bullmq";
import sharp from "sharp";
import IORedis from "ioredis";
import path from "path";
import fs from "fs/promises";

interface ImageJobData {
  photoId: string;
  originalPath: string;
}

interface ImageJobResult {
  photoId: string;
  derivatives: string[];
}

const SIZES = [300, 600, 1200, 2400] as const;
const JPEG_QUALITY = 85;
const WEBP_QUALITY = 82;

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

// Disable cache for long-running worker
sharp.cache(false);

export const imageWorker = new Worker<ImageJobData, ImageJobResult>(
  "image-processing",
  async (job: Job<ImageJobData>) => {
    const { photoId, originalPath } = job.data;
    const outputDir = path.join(
      process.env.STORAGE_PATH!,
      "derivatives",
      photoId,
    );

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Get original metadata
    const metadata = await sharp(originalPath).metadata();
    const originalWidth = metadata.width ?? 0;

    const derivatives: string[] = [];
    let progress = 0;
    const totalOps = SIZES.filter((s) => s <= originalWidth).length * 2; // 2 formats each

    for (const width of SIZES) {
      // Skip if original is smaller
      if (originalWidth < width) continue;

      const pipeline = sharp(originalPath)
        .rotate() // Auto-orient from EXIF
        .resize(width, null, {
          fit: "inside",
          withoutEnlargement: true,
          kernel: "lanczos3",
        })
        .withMetadata(); // Convert to sRGB, preserve ICC

      // WebP output
      const webpPath = path.join(outputDir, `${width}w.webp`);
      await pipeline
        .clone()
        .webp({
          quality: WEBP_QUALITY,
          effort: 4, // Balance speed/compression
        })
        .toFile(webpPath);
      derivatives.push(webpPath);

      progress++;
      await job.updateProgress(Math.round((progress / totalOps) * 100));

      // JPEG output
      const jpegPath = path.join(outputDir, `${width}w.jpg`);
      await pipeline
        .clone()
        .jpeg({
          quality: JPEG_QUALITY,
          mozjpeg: true, // Better compression
          chromaSubsampling: "4:4:4", // Better quality for photography
        })
        .toFile(jpegPath);
      derivatives.push(jpegPath);

      progress++;
      await job.updateProgress(Math.round((progress / totalOps) * 100));
    }

    return { photoId, derivatives };
  },
  {
    connection,
    concurrency: 2, // Adjust based on available memory
  },
);

// CRITICAL: Error handling
imageWorker.on("error", (err) => {
  console.error("[ImageWorker] Error:", err);
});

imageWorker.on("failed", (job, err) => {
  console.error(`[ImageWorker] Job ${job?.id} failed:`, err.message);
  // TODO: Update photo status to 'error' in database
});

imageWorker.on("completed", (job, result) => {
  console.log(
    `[ImageWorker] Job ${job.id} completed:`,
    result.derivatives.length,
    "files",
  );
  // TODO: Update photo status to 'ready' in database
});
```

### Queue Setup with Production Settings

```typescript
// Source: BullMQ production docs
// src/infrastructure/jobs/queues.ts

import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false, // Fail fast for queue operations
});

export const imageQueue = new Queue("image-processing", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000, // 2s, 4s, 8s
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed for visibility
    },
    removeOnFail: {
      count: 500, // Keep more failed for debugging
    },
  },
});

// Add job helper
export async function enqueueImageProcessing(
  photoId: string,
  originalPath: string,
): Promise<string> {
  const job = await imageQueue.add(
    "process-image",
    { photoId, originalPath },
    { jobId: `photo-${photoId}` }, // Prevent duplicate jobs
  );
  return job.id!;
}
```

### Graceful Shutdown

```typescript
// Source: BullMQ production docs
// src/infrastructure/jobs/shutdown.ts

import { imageWorker } from "./workers/imageProcessor";
import { imageQueue } from "./queues";

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, closing gracefully...`);

  // Stop accepting new jobs, finish current ones
  await imageWorker.close();
  await imageQueue.close();

  console.log("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

## State of the Art

| Old Approach           | Current Approach      | When Changed | Impact                                        |
| ---------------------- | --------------------- | ------------ | --------------------------------------------- |
| ImageMagick shell exec | Sharp native bindings | 2015+        | 4-5x faster, memory safe                      |
| Bull (v3)              | BullMQ (v5)           | 2020+        | TypeScript, Redis Streams, better reliability |
| JPEG only              | WebP + JPEG           | 2019+        | 25-34% smaller files, 97% browser support     |
| Strip all metadata     | Preserve sRGB ICC     | Always best  | Correct colors in browsers                    |
| Synchronous processing | Async job queue       | Always best  | No timeouts, retry logic, scalability         |

**Deprecated/outdated:**

- **Bull v3:** Use BullMQ v5 instead (same authors, better API)
- **gm/imagemagick bindings:** Slower, shell-based, less safe
- **Jimp:** OK for serverless but too slow for production image pipelines
- **JPEG-only output:** WebP has 97% support, significant savings

## Open Questions

Things that couldn't be fully resolved:

1. **AVIF Generation - Include or Not?**
   - What we know: AVIF offers 20%+ better compression than WebP, 93.9% browser coverage
   - What's unclear: Encoding is significantly slower (effort 0-9), may not be worth it for personal portfolio
   - Recommendation: Start with WebP + JPEG. Add AVIF later as optional enhancement if load times are an issue.

2. **Exact Quality Settings**
   - What we know: JPEG 85 with mozjpeg and WebP 82 are good starting points
   - What's unclear: Optimal settings depend on actual photo content (landscapes vs portraits)
   - Recommendation: Use recommended settings, create a few test outputs, adjust if needed.

3. **Worker Process Architecture**
   - What we know: BullMQ supports separate worker processes or embedded in main app
   - What's unclear: Best approach for this Next.js app (separate process vs API route worker)
   - Recommendation: Start with separate worker script, can be run alongside `next dev` in development.

## Sources

### Primary (HIGH confidence)

- [Sharp official documentation](https://sharp.pixelplumbing.com/) - Resize API, Output API, Colour API, Input API
- [BullMQ official documentation](https://docs.bullmq.io/) - Quick Start, Workers, Retrying Jobs, Going to Production
- [Sharp GitHub releases](https://github.com/lovell/sharp/releases) - Version v0.34.5 confirmed

### Secondary (MEDIUM confidence)

- [Sharp performance comparison](https://sharp.pixelplumbing.com/performance/) - 4-5x faster than ImageMagick benchmark
- [WebP vs AVIF comparison](https://elementor.com/blog/webp-vs-avif/) - Browser support and compression ratios
- [BullMQ production guide](https://docs.bullmq.io/guide/going-to-production) - Redis settings, graceful shutdown

### Tertiary (LOW confidence)

- Various Medium articles on BullMQ patterns - Community patterns, not officially verified
- GitHub issues for Sharp edge cases - Specific to certain versions/configurations

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Sharp and BullMQ are well-documented, actively maintained, industry standard
- Architecture: HIGH - Patterns are from official docs and widely used in production
- Pitfalls: HIGH - Documented in official docs and verified through multiple sources

**Research date:** 2026-01-29
**Valid until:** 2026-03-01 (30 days - both libraries are stable)
