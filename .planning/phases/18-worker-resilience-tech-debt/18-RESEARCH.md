# Phase 18: Worker Resilience & Tech Debt - Research

**Researched:** 2026-02-07
**Domain:** BullMQ worker resilience, admin UI filtering, SQLite schema management
**Confidence:** HIGH

## Summary

Phase 18 addresses two distinct concerns: (1) ensuring photos never get permanently stuck in "processing" status by improving worker resilience and adding admin visibility/controls, and (2) resolving known schema and code debt items.

The worker resilience work is straightforward: the current `imageProcessor.ts` performs DB status updates in BullMQ event handlers (`completed`, `failed`) which execute OUTSIDE the processor function. If the worker crashes after image processing but before the event handler runs, the photo stays stuck in "processing" forever. Moving DB updates into the processor function (where BullMQ's retry mechanism covers them) and adding stale detection logic will fix this. The admin UI needs status filtering on the existing dashboard and a reprocess API endpoint that re-enqueues jobs.

The tech debt work involves three concrete items: verifying/fixing the FK constraint on `albums.coverPhotoId`, reconciling schema drift between the Drizzle schema, client.ts initial CREATE, and test-db.ts, and fixing misleading code comments. Research found one clearly wrong comment in client.ts and confirmed the imageProcessor.ts JPEG reference was already fixed in a prior phase.

**Primary recommendation:** Move all DB status updates into the BullMQ processor function so they are covered by BullMQ's 3-attempt retry mechanism. Add a `findByStatus` repository method and a time-threshold query for stale detection. Build filtering into the existing admin dashboard with a status filter dropdown and a "Reprocess" button that hits a new API endpoint.

## Standard Stack

### Core

| Library        | Version | Purpose                        | Why Standard                                                           |
| -------------- | ------- | ------------------------------ | ---------------------------------------------------------------------- |
| bullmq         | ^5.67.2 | Job queue for image processing | Already in use; processor-level DB updates are the recommended pattern |
| drizzle-orm    | ^0.45.1 | Database ORM                   | Already in use; schema changes via ALTER TABLE                         |
| better-sqlite3 | ^12.6.2 | SQLite driver                  | Already in use                                                         |
| vitest         | ^4.0.18 | Test framework                 | Already in use; test infrastructure from Phase 15                      |
| Next.js        | 16.1.6  | App Router framework           | Already in use                                                         |

### Supporting

| Library | Version | Purpose            | When to Use                            |
| ------- | ------- | ------------------ | -------------------------------------- |
| zod     | ^4.3.6  | Request validation | For new API route (reprocess endpoint) |

### Alternatives Considered

| Instead of                 | Could Use                                       | Tradeoff                                                                                                                         |
| -------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| In-processor DB updates    | Separate BullMQ event listeners + retry wrapper | Event listeners are what we have now; they miss crashes between processing and event firing                                      |
| Client-side status filter  | Server-side query param filtering               | Server-side better for large photo sets but client-side simpler for MVP; client-side works fine for admin panel with <10k photos |
| Cron-based stale detection | On-demand API check                             | Cron requires scheduler setup; on-demand query at dashboard load is simpler and sufficient for single-admin app                  |

**Installation:**
No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── domain/
│   └── repositories/
│       └── PhotoRepository.ts          # Add findByStatus(), findStaleProcessing()
├── infrastructure/
│   ├── database/
│   │   ├── client.ts                   # Fix misleading FK comment
│   │   ├── schema.ts                   # Already correct (onDelete: "set null")
│   │   └── repositories/
│   │       └── SQLitePhotoRepository.ts # Implement new query methods
│   └── jobs/
│       └── workers/
│           └── imageProcessor.ts       # Move DB updates into processor function
├── presentation/
│   └── components/
│       └── PhotoGrid.tsx               # No changes needed (already shows status badges)
├── app/
│   ├── admin/
│   │   └── (protected)/
│   │       ├── page.tsx                # Add status filter UI
│   │       └── AdminDashboardClient.tsx # Add filter state and controls
│   └── api/
│       └── admin/
│           └── photos/
│               └── [id]/
│                   └── reprocess/
│                       └── route.ts    # NEW: POST endpoint to requeue processing
└── __tests__/
    └── helpers/
        └── test-db.ts                  # Fix schema drift to match client.ts
```

### Pattern 1: In-Processor DB Updates (BullMQ Best Practice)

**What:** Move the `photo.status = "ready"` update from the `completed` event handler into the processor function itself, so it's covered by BullMQ's automatic retry.
**When to use:** Whenever a side-effect must reliably happen after job processing.
**Example:**

```typescript
// CURRENT (fragile): DB update in event handler outside processor
imageWorker.on("completed", async (job, result) => {
  // If worker crashes here, photo stays "processing" forever
  const photo = await repository.findById(result.photoId);
  photo.status = "ready";
  await repository.save(photo);
});

// BETTER: DB update inside processor function (covered by BullMQ retry)
async (job: Job<ImageJobData>) => {
  const { photoId, originalPath } = job.data;
  // ... generate derivatives, blur, exif, dimensions ...

  // DB update inside processor - if this fails, BullMQ retries the whole job
  const repository = new SQLitePhotoRepository();
  const photo = await repository.findById(photoId);
  if (photo) {
    photo.status = "ready";
    photo.blurDataUrl = blurDataUrl;
    photo.exifData = exifData;
    photo.width = width;
    photo.height = height;
    await repository.save(photo);
  }

  return { photoId, derivatives, blurDataUrl, exifData, width, height };
};
```

### Pattern 2: Stale Processing Detection via Repository Query

**What:** Add a repository method that finds photos stuck in "processing" beyond a configurable threshold.
**When to use:** Dashboard load, admin health check.
**Example:**

```typescript
// In PhotoRepository interface
findStaleProcessing(thresholdMs: number): Promise<Photo[]>;

// In SQLitePhotoRepository
async findStaleProcessing(thresholdMs: number): Promise<Photo[]> {
  const cutoff = new Date(Date.now() - thresholdMs);
  const results = await db
    .select()
    .from(photos)
    .where(
      and(
        eq(photos.status, "processing"),
        lt(photos.createdAt, cutoff)
      )
    );
  return results.map((row) => this.toDomain(row));
}
```

### Pattern 3: Reprocess API Endpoint

**What:** POST endpoint that resets photo status and re-enqueues the processing job.
**When to use:** Admin triggers reprocessing from the dashboard.
**Example:**

```typescript
// POST /api/admin/photos/[id]/reprocess
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const photo = await photoRepository.findById(id);
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  // Reset status and re-enqueue
  photo.status = "processing";
  photo.updatedAt = new Date();
  await photoRepository.save(photo);

  const originalPath = /* resolve from storage */;
  await enqueueImageProcessing(id, originalPath);

  return NextResponse.json({ status: "processing" });
}
```

### Anti-Patterns to Avoid

- **DB updates only in event handlers:** BullMQ event handlers (`completed`, `failed`) run outside the processor function. If the worker process dies between job completion and event handler execution, the DB never gets updated. Always put critical DB updates in the processor function.
- **Using `db:push` for schema changes:** Memory says this caused runtime errors in Phase 6. Always use explicit `ALTER TABLE` or table rebuild migrations.
- **Idempotency failure in reprocess:** The `enqueueImageProcessing` function already uses `jobId: \`photo-\${photoId}\`` to prevent duplicate jobs. However, for reprocessing, the old completed/failed job may still exist. Need to either remove the old job first or use a different job ID strategy (e.g., append a timestamp).

## Don't Hand-Roll

| Problem                    | Don't Build                  | Use Instead                              | Why                                                                  |
| -------------------------- | ---------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| Job retry logic            | Custom retry with setTimeout | BullMQ's built-in `attempts` + `backoff` | Already configured: 3 attempts with exponential backoff (2s, 4s, 8s) |
| Status filtering query     | Raw SQL string building      | Drizzle ORM `where(eq(...))`             | Type-safe, SQL injection safe                                        |
| FK constraint verification | Manual PRAGMA checks         | Existing Phase 13 migration in client.ts | Already implemented, just needs verification                         |
| Job deduplication          | Custom locking mechanism     | BullMQ's `jobId` option                  | Already in use via `jobId: \`photo-\${photoId}\``                    |

**Key insight:** BullMQ already handles retry, deduplication, and job lifecycle. The main gap is that critical side-effects (DB status updates) are outside the retry boundary.

## Common Pitfalls

### Pitfall 1: BullMQ Job ID Collision on Reprocess

**What goes wrong:** `enqueueImageProcessing` uses `jobId: \`photo-\${photoId}\``which prevents duplicate jobs. When reprocessing, if the old job still exists in completed/failed state, BullMQ may reject the new job.
**Why it happens:** BullMQ keeps completed/failed jobs per`removeOnComplete`/`removeOnFail`config (currently 100/500). The job ID must be unique among non-removed jobs.
**How to avoid:** Either (a) remove the old job before re-enqueuing, (b) use a different job ID for reprocess (e.g.,`photo-${photoId}-${Date.now()}`), or (c) explicitly call `imageQueue.remove(jobId)` before adding.
**Warning signs:** Reprocess silently fails with no job created.

### Pitfall 2: Race Condition Between Processor and Event Handlers

**What goes wrong:** If both the processor function AND the event handler try to update the photo status, they can race and the event handler might overwrite a more recent state.
**Why it happens:** Moving DB updates into the processor but leaving old event handlers in place creates two writers.
**How to avoid:** Remove status-setting logic from event handlers when moving it into the processor. Keep event handlers only for logging/monitoring.
**Warning signs:** Photo status flickers between states; database shows stale values.

### Pitfall 3: Stale Detection False Positives

**What goes wrong:** A legitimate long-running image processing job (e.g., 50MP image) gets flagged as "stale."
**Why it happens:** Threshold set too low; some images genuinely take 30+ seconds.
**How to avoid:** Use a generous threshold (e.g., 30 minutes default). The threshold should be configurable. Stale detection should flag, not auto-requeue.
**Warning signs:** Photos keep getting reprocessed in a loop.

### Pitfall 4: SQLite FK Constraint Already Fixed

**What goes wrong:** The Phase 13 migration in client.ts already fixes the FK constraint at database initialization time. DEBT-01 might be a no-op if the migration has already run on the production database.
**Why it happens:** The migration checks `coverFk.on_delete !== "SET NULL"` and only runs if needed.
**How to avoid:** Verify the FK state at test time rather than assuming it needs fixing. The code-level fix is already in place. DEBT-01 is really about verifying it works, not implementing it.
**Warning signs:** Attempting to fix what's already fixed.

### Pitfall 5: Resolving Original File Path for Reprocess

**What goes wrong:** The reprocess endpoint needs the original file path, but it's not stored in the database.
**Why it happens:** The upload route saves to `storage/originals/{photoId}/original.{ext}` but the exact extension depends on what was uploaded.
**How to avoid:** Either (a) read the directory `storage/originals/{photoId}/` and find the file, or (b) store the original path in the photo record. Option (a) is simpler and doesn't require a schema change.
**Warning signs:** Reprocess fails with "file not found" because the extension was wrong.

## Code Examples

Verified patterns from the existing codebase:

### Current Worker Architecture (What Needs Changing)

```typescript
// src/infrastructure/jobs/workers/imageProcessor.ts

// CURRENT: Processor function only does image work, returns result
async (job: Job<ImageJobData>) => {
  // ... image processing ...
  return { photoId, derivatives, blurDataUrl, exifData, width, height };
};

// CURRENT: DB updates in event handlers (OUTSIDE retry boundary)
imageWorker.on("completed", async (job, result) => {
  // FRAGILE: If worker crashes here, photo stays "processing"
  const repository = new SQLitePhotoRepository();
  const photo = await repository.findById(result.photoId);
  if (photo) {
    photo.status = "ready";
    photo.blurDataUrl = result.blurDataUrl;
    // ... etc
    await repository.save(photo);
  }
});

imageWorker.on("failed", async (job, err) => {
  // FRAGILE: Same crash vulnerability
  if (job?.data.photoId) {
    const repository = new SQLitePhotoRepository();
    const photo = await repository.findById(job.data.photoId);
    if (photo) {
      photo.status = "error";
      await repository.save(photo);
    }
  }
});
```

### Current Admin Dashboard (What Needs Filter UI)

```typescript
// src/app/admin/(protected)/page.tsx
// Currently fetches ALL photos with no filtering:
const photos = await photoRepository.findAll();
const sortedPhotos = [...photos].sort(
  (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
);
```

### Current Upload Flow (Shows Reprocess Pattern)

```typescript
// src/app/api/admin/upload/route.ts
// Existing enqueue pattern with graceful Redis handling:
try {
  await Promise.race([
    enqueueImageProcessing(photoId, filePath),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Job enqueue timeout")), 10000),
    ),
  ]);
} catch (enqueueError) {
  console.error(
    `[Upload] Failed to enqueue for photo ${photoId}:`,
    enqueueError,
  );
  // Photo saved with "processing" status - will need manual requeue
}
```

### Existing Queue Configuration

```typescript
// src/infrastructure/jobs/queues.ts
// Already has retry config:
defaultJobOptions: {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
},
// Job ID prevents duplicates:
{ jobId: `photo-${photoId}` }
```

### File Path Resolution for Reprocess

```typescript
// src/infrastructure/storage/fileStorage.ts
// Original files stored at: storage/originals/{photoId}/original.{ext}
// Extension comes from uploaded filename: extname(file.name).toLowerCase() || ".jpg"
// For reprocess, need to discover the file in the directory
```

## Codebase Analysis: Schema Drift Details

### FK Constraint Status (DEBT-01)

The Drizzle schema (`schema.ts` line 35) declares `onDelete: "set null"`. The `client.ts` initial `CREATE TABLE` (line 43) does NOT include `ON DELETE SET NULL`. The Phase 13 migration (client.ts lines 97-148) detects this via `PRAGMA foreign_key_list(albums)` and rebuilds the table with the correct FK. This means:

- **New databases:** Created with NO ACTION, immediately migrated to SET NULL on initialization
- **Existing databases:** Migrated on next startup
- **The fix is already implemented.** DEBT-01 is really about verifying it works and potentially simplifying (putting SET NULL in the initial CREATE to eliminate the unnecessary migration step for new databases).

### Schema Drift Between client.ts and test-db.ts (DEBT-02)

| Aspect                        | client.ts initial CREATE | test-db.ts step 2 | Drizzle schema.ts      |
| ----------------------------- | ------------------------ | ----------------- | ---------------------- |
| `tags` column                 | Present                  | NOT present       | Present                |
| FK on cover_photo_id          | NO ACTION                | NO ACTION         | `onDelete: "set null"` |
| Both apply Phase 13 migration | Yes (rebuilds table)     | Yes (step 7)      | N/A                    |

The drift: client.ts bakes in `tags TEXT` in the initial CREATE, but test-db.ts step 2 does not (it gets added in step 7 migration). Both end up with the same final schema after migrations. But if client.ts initial CREATE also included `ON DELETE SET NULL`, the Phase 13 migration would be a no-op for new databases, which would be cleaner.

### Stale/Misleading Comments (DEBT-03)

1. **client.ts line 127:** Says "SQLite updates FK references in other tables during ALTER TABLE RENAME" -- this is WRONG. The truth (as stated in test-db.ts lines 94-95) is "SQLite does NOT update FK references in other tables when foreign_keys is OFF during ALTER TABLE RENAME." The rebuild is needed BECAUSE SQLite doesn't update them.
2. **imageProcessor.ts JPEG reference:** Already fixed. Line 52 now correctly says "WebP + AVIF."
3. **imageService.ts line 14:** Says "AVIF 80 (more efficient than JPEG, better compression)" -- this is a CORRECT comparative statement, not stale. AVIF IS more efficient than JPEG. However, it could be made clearer since the system doesn't generate JPEG at all. Arguably worth clarifying but not technically wrong.

## State of the Art

| Old Approach                 | Current Approach                 | When Changed                           | Impact                                           |
| ---------------------------- | -------------------------------- | -------------------------------------- | ------------------------------------------------ |
| DB updates in event handlers | DB updates in processor function | BullMQ best practice (documented)      | Critical side-effects covered by retry mechanism |
| No stale detection           | Threshold-based stale queries    | Standard pattern for job queue systems | Prevents photos stuck forever                    |
| Manual requeue via scripts   | Admin UI reprocess button        | UX improvement                         | No CLI/script access needed                      |

**Deprecated/outdated:**

- The current event-handler approach for DB updates is not wrong per se, but it's fragile for the specific use case of "photo must eventually leave processing state"

## Open Questions

1. **Stale threshold default value**
   - What we know: Worker processes images at concurrency 2, 50MP images use ~144MB each. Processing time varies by image size.
   - What's unclear: Typical processing time range. Is 30 minutes a reasonable default threshold?
   - Recommendation: Default to 30 minutes. Make configurable via environment variable (e.g., `STALE_PROCESSING_THRESHOLD_MS`). This is generous enough to avoid false positives.

2. **Should stale detection auto-requeue or just flag?**
   - What we know: The requirements say "automatically detected and flagged" (Success Criterion 3). They don't say "automatically reprocessed."
   - What's unclear: Whether flagging means changing status to "error" or just displaying differently in the admin UI.
   - Recommendation: Flag by querying at dashboard load time. Don't auto-change status. Show stale photos with a visual indicator in the admin panel. Let admin manually trigger reprocess.

3. **How to handle BullMQ job ID collision on reprocess**
   - What we know: Current job ID is `photo-${photoId}`. Old completed/failed jobs are kept (100 completed, 500 failed).
   - What's unclear: Whether BullMQ rejects `add()` when a completed/failed job with the same ID exists.
   - Recommendation: Remove old job before re-enqueuing, or use timestamp-suffixed job ID for reprocess. Test this behavior in integration tests.

4. **Should the processor function handle the "error" status update too?**
   - What we know: Currently, `failed` event handler sets status to "error". If we move "ready" update into processor, should "error" update also move?
   - What's unclear: BullMQ's `failed` event fires after all retry attempts are exhausted. If the processor throws, BullMQ handles retries automatically. The `failed` handler only fires after final failure.
   - Recommendation: Keep the `failed` event handler for setting "error" status, since it fires after ALL retries are exhausted (3 attempts). The processor function should focus on the happy path. But add explicit retry logic (try/catch with retry) to the `failed` handler's DB update to make it resilient too.

## Sources

### Primary (HIGH confidence)

- **Codebase analysis** - Direct inspection of all relevant source files:
  - `src/infrastructure/jobs/workers/imageProcessor.ts` - Current worker architecture
  - `src/infrastructure/jobs/queues.ts` - Queue configuration (retry, dedup)
  - `src/infrastructure/database/schema.ts` - Drizzle schema declarations
  - `src/infrastructure/database/client.ts` - Initial schema + migrations
  - `src/__tests__/helpers/test-db.ts` - Test schema (drift comparison)
  - `src/app/admin/(protected)/page.tsx` - Admin dashboard (needs filter)
  - `src/app/admin/(protected)/AdminDashboardClient.tsx` - Client component
  - `src/app/api/admin/photos/[id]/route.ts` - Existing photo API
  - `src/app/api/admin/upload/route.ts` - Upload flow reference
  - `src/infrastructure/storage/fileStorage.ts` - File path structure
  - `src/domain/repositories/PhotoRepository.ts` - Repository interface
  - `src/infrastructure/database/repositories/SQLitePhotoRepository.ts` - Repository implementation
- **Project memory** - Known issues documented: coverPhotoId FK mismatch, db:push prohibition

### Secondary (MEDIUM confidence)

- BullMQ documentation - Processor function vs event handler lifecycle (verified against codebase behavior)
- SQLite documentation - FK constraint behavior with `PRAGMA foreign_keys = OFF` during ALTER TABLE RENAME

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - No new libraries needed, all patterns use existing dependencies
- Architecture: HIGH - Direct codebase analysis, clear patterns for worker refactor and API endpoint
- Pitfalls: HIGH - Identified from direct code inspection (job ID collision, event handler race, file path resolution)
- Schema drift: HIGH - Line-by-line comparison of client.ts, test-db.ts, and schema.ts
- Stale comments: HIGH - Every instance found and evaluated

**Research date:** 2026-02-07
**Valid until:** 2026-03-09 (30 days - stable domain, no fast-moving dependencies)
