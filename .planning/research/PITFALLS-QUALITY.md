# Pitfalls Research: Retrofitting Quality & Hardening

**Domain:** Adding testing, error handling, and performance optimization to existing Next.js 16 photography portfolio
**Researched:** 2026-02-06
**Confidence:** HIGH (based on direct codebase analysis of all infrastructure, API, and domain layers)

**Scope:** This document covers pitfalls specific to ADDING quality to an existing working codebase -- not building greenfield. Every pitfall was identified from actual patterns in the current source code.

---

## Critical Pitfalls

Mistakes that cause test infrastructure failure, data corruption, or wasted effort on the wrong approach.

---

### Pitfall 1: Database Module Initialization Side Effects Break Test Isolation

**What goes wrong:**
The database client (`src/infrastructure/database/client.ts`) calls `initializeDatabase()` at module load time (line 140). This means any file that imports anything from the database layer -- directly or transitively -- triggers real database initialization, filesystem I/O, and schema migrations. Tests that import repository classes, API route handlers, or any infrastructure code will connect to the real SQLite database, potentially corrupt development data, and fail in CI where no `.env` file exists.

The `env.ts` module (`src/infrastructure/config/env.ts`) also validates environment variables at import time via Zod, throwing immediately if `AUTH_SECRET`, `ADMIN_PASSWORD_HASH`, `DATABASE_PATH`, or `STORAGE_PATH` are missing.

**Why it happens:**
Module-level singleton initialization (`const db = drizzle(...)` + `initializeDatabase()` at top scope) is a standard pattern for web apps. It ensures the DB is always ready. But it is fundamentally incompatible with test isolation because there is no way to intercept the initialization before it fires.

**How to avoid:**

1. **Do not import real infrastructure modules in unit tests.** Use dependency injection through the repository interfaces already defined in `src/domain/repositories/`. The Clean Architecture boundary IS the testing seam.
2. For repository integration tests that need a database, create a test helper that:
   - Sets `DATABASE_PATH` to a temp file BEFORE any infrastructure imports
   - Uses dynamic `import()` to load database modules after env is configured
   - Runs `initializeDatabase()` explicitly on the temp database
   - Deletes the temp DB file in `afterAll`
3. For the `env.ts` module, create a `vitest.setup.ts` file that sets all required env vars to safe test values BEFORE any modules load.
4. Add `vitest.setup.ts` to `vitest.config.ts` as a `setupFiles` entry.

**Warning signs:**

- Tests pass locally but fail in CI with "Invalid environment variables" errors
- Test suite takes >5s for unit tests because real DB is being created
- Development database gets modified or corrupted after running tests
- Tests fail with `SQLITE_CANTOPEN` or `SQLITE_BUSY` errors
- Running `vitest` in a fresh clone fails immediately

**Phase to address:** FIRST phase -- testing infrastructure setup. This blocks ALL other testing work.

---

### Pitfall 2: `server-only` Modules Crash Vitest

**What goes wrong:**
Two auth modules (`src/infrastructure/auth/session.ts`, `src/infrastructure/auth/dal.ts`) import `"server-only"` at the top. The `"server-only"` package is a build-time boundary marker that throws at runtime when imported outside React Server Component context. Vitest runs in plain Node.js, so any test that transitively imports these modules crashes with: `Error: This module cannot be imported from a Client Component module.`

Additionally, `dal.ts` uses `cookies()` from `next/headers` and `cache()` from `react`, both of which require the Next.js async storage context. These will throw or return undefined in Vitest.

**Why it happens:**
`"server-only"` is designed to prevent accidental client-side imports during Next.js builds. Vitest does not go through the Next.js build pipeline, so it encounters the runtime guard directly.

**How to avoid:**

1. **Mock `server-only` globally** in vitest setup: create `src/__mocks__/server-only.ts` that exports nothing, or add `vi.mock("server-only", () => ({}))` in setup file.
2. **Mock `next/headers`** with a factory returning controllable cookie/header stores.
3. **Mock `next/navigation`** -- `redirect()` throws a special `NEXT_REDIRECT` error that Vitest will not handle correctly. Mock it to throw a recognizable test error or to no-op.
4. **Mock `next/cache`** -- `revalidatePath()` is called in album deletion (line 125-126 of `src/app/api/admin/albums/[id]/route.ts`).
5. Add ALL Next.js mocks in `vitest.setup.ts` so they apply universally.

**Warning signs:**

- `Error: This module cannot be imported from a Client Component module` in test output
- `cookies is not a function` or `headers is not a function` errors
- Tests pass individually but fail when run together (module cache pollution)
- `redirect` calls cause unhandled exceptions in tests

**Phase to address:** FIRST phase -- testing infrastructure setup. Must be solved alongside Pitfall 1.

---

### Pitfall 3: Schema Drift Between Drizzle Schema and Actual SQLite Database

**What goes wrong:**
The Drizzle schema file (`schema.ts`) represents the "desired" state, but the actual database schema depends on which migrations in `initializeDatabase()` have run. Known drifts:

1. **`albums.tags`**: Present in Drizzle schema (line 34) but NOT in the initial CREATE TABLE statement (lines 38-47 of client.ts). It only gets added when the FK migration (lines 106-128) recreates the table -- but that migration only fires if the FK constraint is detected as wrong.
2. **`albums.cover_photo_id` FK behavior**: Drizzle schema says `onDelete: "set null"` but the CREATE TABLE uses bare `REFERENCES photos(id)` (defaults to NO ACTION in SQLite). The migration attempts to fix this, but only if it detects the mismatch.
3. **`photos.exif_data`, `photos.width`, `photos.height`**: Added via ALTER TABLE migrations (lines 75-94), but only if the columns do not already exist.

If tests create a fresh database using only CREATE TABLE (not running the full migration chain), or if the production database predates certain migrations, the schema will differ from what Drizzle expects.

**Why it happens:**
No versioned migration system exists. Migrations are imperative checks ("does column X exist? if not, add it") embedded in `initializeDatabase()`. The CREATE TABLE statements are frozen at their original version and do not match the current Drizzle schema.

**How to avoid:**

1. **Create a single `createTestDatabase()` helper** that runs the exact same `initializeDatabase()` function, ensuring test DBs match production schema.
2. **Add a schema validation test** early in the test suite that runs `PRAGMA table_info(photos)`, `PRAGMA table_info(albums)`, and `PRAGMA table_info(photo_albums)` and asserts all expected columns exist with correct types.
3. **Add a `PRAGMA foreign_key_list(albums)` test** that verifies `cover_photo_id` has `on_delete = SET NULL`.
4. **Audit the production database** before starting quality work: verify `albums.tags` exists, verify FK constraint is correct.

**Warning signs:**

- Tests pass against `db:push`-synced databases but production has different columns
- `SQLITE_ERROR: table albums has no column named tags` in production
- Integration tests insert data with nulls where schema expects values

**Phase to address:** FIRST phase (testing setup) AND a dedicated schema audit task before any other work.

---

### Pitfall 4: Redis Module-Level Connections Hang Tests

**What goes wrong:**
Three modules create IORedis connections at module scope:

- `src/infrastructure/jobs/queues.ts` (line 31): `new IORedis(env.REDIS_URL, ...)`
- `src/infrastructure/jobs/workers/imageProcessor.ts` (line 19): `new IORedis(env.REDIS_URL, ...)`
- `src/infrastructure/auth/rateLimiter.ts` (line 10): `new IORedis(env.REDIS_URL, ...)`

Any test that imports these modules -- or any module that transitively imports them -- will attempt to connect to Redis. Without Redis running (common in CI and test environments), this causes:

- Hanging tests (IORedis retrying connections, default is infinite retries)
- Unhandled rejection warnings flooding test output
- Tests timing out after 30+ seconds

The upload route (`src/app/api/admin/upload/route.ts`) imports from `@/infrastructure/jobs` (line 4), which triggers `queues.ts` to load, which creates a Redis connection.

**Why it happens:**
IORedis connections are created at module load time as singletons. `enableOfflineQueue: false` is set on some connections but `maxRetriesPerRequest: null` means retries are infinite for BullMQ compatibility.

**How to avoid:**

1. **Mock the entire `@/infrastructure/jobs` module** in unit tests. Never let `queues.ts` or `imageProcessor.ts` actually import in unit tests.
2. **Mock `ioredis`** globally in vitest setup to return a no-op connection.
3. For integration tests that need Redis, use a conditional skip: `describe.skipIf(!process.env.REDIS_URL)`.
4. Add `@/infrastructure/auth/rateLimiter` to the mock list -- it also creates a Redis connection at import time.

**Warning signs:**

- Tests hang for 30+ seconds before timing out
- `MaxRetriesPerRequestError` in test output
- `Error: connect ECONNREFUSED 127.0.0.1:6379` flooding stderr
- Single test file takes >10s to complete

**Phase to address:** FIRST phase -- testing infrastructure setup. Mock strategy must cover ALL three Redis-dependent modules.

---

### Pitfall 5: Photo Deletion Has File-Before-DB Race Condition

**What goes wrong:**
In `DELETE /api/admin/photos/[id]` (lines 77-81), files are deleted BEFORE the database record:

```
await deletePhotoFiles(id);   // irreversible
await photoRepository.delete(id);  // may fail
```

If the DB delete fails (FK constraint, DB locked, disk full), the photo record still exists but all image files are gone. The admin panel shows a photo that cannot be displayed.

Similarly, `DELETE /api/admin/albums/[id]` (lines 112-123) deletes the album first (cascade removes junction entries), then iterates photo IDs in a loop to delete files and records. If the process crashes mid-loop, some photos are orphaned.

**Why it happens:**
The code follows the intuitive order (clean up resources, then remove record) rather than the safe order. File deletion is irreversible; database operations can at least be retried.

**How to avoid:**

1. **Reverse the operation order:** Delete the DB record first (inside a transaction), then delete files. Orphaned files are a minor disk space issue; orphaned DB records with missing files break the UI.
2. **Wrap multi-step deletions in transactions:** Album delete + photo delete should be a single SQLite transaction.
3. **Write error handling tests** that verify correct behavior when:
   - File deletion fails (permission denied, already deleted)
   - DB deletion fails (FK constraint, SQLITE_BUSY)
   - Process crashes mid-operation
4. **Add an orphan cleanup utility** that reconciles files on disk with DB records.

**Warning signs:**

- Admin panel shows photos with broken image icons
- Storage directory grows even after photos are "deleted"
- FK constraint errors when deleting photos that are album covers

**Phase to address:** Error handling phase. This is a correctness bug, not just a test gap.

---

### Pitfall 6: Adding Error Handling That Swallows Errors Silently

**What goes wrong:**
The codebase already has several catch blocks that silently swallow errors, setting a dangerous precedent:

| Location                                 | What is swallowed                 | Impact                                                         |
| ---------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| Upload route (lines 81-84)               | Redis/queue errors                | Photo stays in "processing" forever with NO log entry          |
| Image serving (line 56)                  | Directory read errors in fallback | Returns null, falls through to 404                             |
| Rate limiter (lines 41-47)               | Redis connection errors           | Rate limiting silently disabled                                |
| EXIF extraction (lines 175-177)          | All parsing errors                | Returns null, acceptable for this case                         |
| Worker completed handler (lines 129-131) | DB save errors after processing   | Photo stays "processing" forever despite files being generated |

When adding error handling to the rest of the codebase, copying this "catch and forget" pattern will turn hard failures into silent corruption. The particularly dangerous case is the upload route: when Redis is unavailable, the photo is saved to DB with "processing" status, but no job is enqueued and no error is logged. The photo is permanently stuck.

**Why it happens:**
The existing patterns were written for graceful degradation (Redis unavailable in dev is expected). But developers will copy the pattern for NEW error handling without distinguishing expected-degradation from unexpected-failure.

**How to avoid:**

1. **Audit existing catch blocks first** before adding new error handling. Classify each as:
   - Intentional degradation (Redis unavailable in dev) -- keep, but add monitoring
   - Bug (upload swallows queue error without logging) -- fix immediately
2. **Establish error handling categories:**
   - `logAndDegrade`: Expected failures, app continues with reduced functionality
   - `logAndFail`: Unexpected failures, return error to caller
   - `logAndRetry`: Transient failures, retry with backoff
3. **Every catch block must either re-throw or log at ERROR level.** No empty catch bodies.
4. **Write tests for error paths:** Assert that expected errors degrade gracefully AND unexpected errors propagate.

**Warning signs:**

- Photos stuck in "processing" status with no error logs
- Admin performs actions that appear to succeed but have no effect
- Error counts are suspiciously low in monitoring

**Phase to address:** Error handling phase. Audit existing patterns BEFORE adding new ones.

---

### Pitfall 7: Mock Repository Divergence From Real SQLite Behavior

**What goes wrong:**
With Clean Architecture's repository interfaces (`PhotoRepository`, `AlbumRepository`), the testing plan will create mock/in-memory implementations. But mock implementations that diverge from real SQLite behavior cause tests to pass against mocks while failing against the real database.

Specific divergence risks in this codebase:

| Repository Method               | Real SQLite Behavior                                  | Naive Mock Behavior                                  |
| ------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `addToAlbum`                    | `onConflictDoNothing()` -- silently ignores duplicate | Throws on duplicate or adds duplicate                |
| `findBySlugPrefix`              | SQL `LIKE` with `%` wildcard                          | `String.startsWith()` -- different for special chars |
| `findRandomFromPublishedAlbums` | `ORDER BY RANDOM()` with JOIN and GROUP BY            | Simple `Math.random()` on flat array                 |
| `save` (upsert)                 | `onConflictDoUpdate` with full row replacement        | May not handle insert vs update correctly            |
| `toDatabase`                    | JSON-serializes `exifData` to string                  | Mock may pass object directly                        |
| `toDomain`                      | JSON-parses `exifData` from string                    | Mock may not test serialization round-trip           |

**Why it happens:**
Mock implementations are written to satisfy the TypeScript interface, not to match SQLite semantics. Without contract tests, drift goes undetected.

**How to avoid:**

1. **Create shared `InMemoryPhotoRepository` and `InMemoryAlbumRepository`** that implement domain interfaces with `Map<string, Photo>` storage. Keep them simple but faithful to the interface contract.
2. **Write contract tests** that run the same test cases against both real and in-memory repositories, asserting identical outputs.
3. **Do NOT mock at the SQL level.** Mock at the repository interface level only.
4. **Test repository implementations directly** (integration tests with temp SQLite) for the mapping logic (`toDomain`/`toDatabase`).

**Warning signs:**

- Tests pass but production behavior differs for edge cases
- Mocks grow increasingly complex (reimplementing SQL JOIN logic)
- Different test files use different mock implementations for the same interface

**Phase to address:** Testing infrastructure phase (create shared mocks) AND repository testing phase (contract tests).

---

## Moderate Pitfalls

Mistakes that cause delays, fragile tests, or technical debt.

---

### Pitfall 8: Testing Next.js App Router Server Components in Vitest

**What goes wrong:**
Attempting to render Server Components, layouts, or pages directly in Vitest. Server Components in this codebase use `async/await` at the component level (`layout.tsx` calls `await verifySession()`), use `redirect()` from `next/navigation`, and import `"server-only"` modules. Vitest with jsdom/happy-dom cannot execute these.

**Why it happens:**
Natural instinct is to test components by rendering them. App Router Server Components are NOT traditional React components -- they are async server functions that return JSX.

**How to avoid:**

1. **Do NOT unit-test Server Component pages.** Test the logic they call instead:
   - Repository methods: integration tests with temp SQLite
   - API route handlers: test with mocked NextRequest/NextResponse
   - Client components: Vitest + React Testing Library
2. **Use Playwright for page-level testing.** Server Component rendering is Next.js's responsibility.
3. Client components in this codebase (`LoginPage`, `HomepageClient`, `AlbumGalleryClient`, `AlbumDetailClient`, `AdminDashboardClient`, `DropZone`, `PhotoGrid`, etc.) CAN be tested in Vitest with jsdom, but mock their server action and fetch dependencies.

**Warning signs:**

- Importing `page.tsx` or `layout.tsx` in vitest test files
- `async/await is not valid in this context` errors
- Tests require increasingly elaborate Next.js mock infrastructure

**Phase to address:** Testing conventions (establish in FIRST phase).

---

### Pitfall 9: Sharp Native Binary Issues in Test/CI Environments

**What goes wrong:**
Sharp is a native Node.js addon (C++ via libvips). It works on the dev machine but may:

- Fail to load in CI if native dependencies are not installed
- Behave differently on macOS (dev) vs Linux (CI) -- especially for HEIC format support
- Cause slow tests if actual image processing runs in the test suite
- Consume excessive memory if tests process real images in parallel

The image service (`src/infrastructure/services/imageService.ts`) and EXIF service (`src/infrastructure/services/exifService.ts`) import Sharp at module top level.

**Why it happens:**
Sharp is a binary dependency, not pure JavaScript. Platform-specific builds are installed via npm/node-gyp. The `package.json` includes `node-gyp` as a dev dependency (line 62), suggesting prior issues with native builds.

**How to avoid:**

1. **Mock Sharp in unit tests.** Create a `__mocks__/sharp.ts` module that returns predictable metadata and dummy buffers.
2. **Create a small integration test suite** for image processing that runs separately. Use tiny test fixture images (1x1 px WebP/JPEG, under 1KB each).
3. **Include test fixture images in the repo** at `src/__tests__/fixtures/`.
4. **Tag image processing tests** so they can be run or skipped independently: `describe.concurrent("image processing [integration]", ...)`.
5. In CI, ensure `npm ci` installs Sharp correctly. Add `--ignore-scripts` only if providing pre-built binaries.

**Warning signs:**

- `Error: Could not load the "sharp" module using the...` in CI
- Image processing tests take 10+ seconds each
- Tests fail intermittently with memory or segfault errors
- Different test results on macOS vs Linux

**Phase to address:** Testing infrastructure (mock strategy) AND CI pipeline setup.

---

### Pitfall 10: Forgetting to Test toDomain/toDatabase Round-Trip Serialization

**What goes wrong:**
Both repositories have `toDomain()` and `toDatabase()` methods with non-trivial logic:

- **exifData**: `JSON.stringify()` on save, `JSON.parse()` on load. Double-serialization bug (JSON string stored as `'"{\\"cameraMake\\"...}"'`) is easy to introduce.
- **Date fields**: Drizzle ORM handles `timestamp_ms` mode, converting between `Date` and millisecond integers. Edge cases: dates before epoch, timezone handling.
- **width/height nullish coalescing**: `row.width ?? null` -- what if the DB returns `0` (falsy but valid)?

If tests only mock repositories, they never exercise these mappings. Serialization bugs surface only in production.

**Why it happens:**
Mapping code looks trivially correct on inspection. The "just property assignment" appearance hides serialization edge cases.

**How to avoid:**

1. **Write round-trip integration tests**: Create a Photo with all fields populated (including exifData with all 11 fields), save it, read it back, assert deep equality.
2. **Test edge cases explicitly**: null exifData, empty string title, Unicode in originalFilename, width=0, height=0, createdAt at epoch.
3. **Test the raw database layer**: After saving, query with raw SQL (`sqlite.prepare("SELECT exif_data FROM photos WHERE id = ?")`) and verify the stored value is valid JSON.
4. **Test Date serialization**: Save a photo, read it back, verify `createdAt` is a valid Date with the correct millisecond value.

**Warning signs:**

- `[object Object]` in database columns
- `SyntaxError: Unexpected token` when parsing exifData
- Dates showing as "Invalid Date" or wrong timezone
- Width/height being 0 when they should be null (or vice versa)

**Phase to address:** Repository testing phase.

---

### Pitfall 11: Performance Optimization Without Baseline Measurements

**What goes wrong:**
Adding performance "improvements" (caching, query optimization, lazy loading, streaming) without measuring what is actually slow. Common premature optimizations in a codebase like this:

- Adding Redis caching for album listings when SQLite serves them in <1ms for small datasets
- Adding database indexes for tables with <1000 rows
- Implementing pagination when the photo library has 50 photos
- Switching to streaming image responses when derivatives are 50-200KB files

**Why it happens:**
Performance optimization feels productive and "obviously" needed. Without baseline data, every optimization can be rationalized.

**How to avoid:**

1. **Measure first.** Before any optimization, establish baselines for:
   - Public page load times (Lighthouse on `/`, `/albums`, `/albums/[id]`)
   - API response times (average and p95 for each endpoint)
   - Image processing throughput (photos/minute through the worker)
   - SQLite query execution times (use `EXPLAIN QUERY PLAN`)
   - Memory usage during image serving
2. **Set performance budgets** before optimizing: "Homepage loads in <2s on slow 3G," "Image API responds in <50ms for cached derivatives."
3. **Only optimize measured bottlenecks.** If the SQLite query takes 0.5ms, do not add a caching layer.
4. **Profile the image serving path specifically**: `readFile()` reads entire files into memory (line 65-68 of image route). For processed derivatives (50-200KB), this is fine. Only optimize if serving originals or very large files.

**Warning signs:**

- "We should add caching" with no latency measurements
- Adding indexes to tables with fewer than 1000 rows
- Implementing pagination for a collection that fits in a single response
- Optimizing cold paths (admin CRUD) instead of hot paths (public image serving)

**Phase to address:** Performance phase -- baseline measurement must be the FIRST task.

---

### Pitfall 12: E2E Tests Depending on Development Data

**What goes wrong:**
Playwright tests that assume specific photos, albums, or admin state exist. Tests pass on the developer's machine (which has real data from manual testing) but fail in CI (empty database) or after another test modifies shared state.

**Why it happens:**
It is faster to write tests against existing data than to set up deterministic fixtures. Pointing Playwright at the dev database is the path of least resistance.

**How to avoid:**

1. **Create a test seed script** (`scripts/seed-test-data.ts`) that populates a fresh database with:
   - 1 admin password hash (known test password)
   - 2-3 albums (one published, one draft)
   - 5-10 photos with known IDs (using tiny fixture images)
   - Album-photo associations with known sort orders
2. **Use a separate test database** via `DATABASE_PATH=./data/test.db`.
3. **Use a separate storage directory** via `STORAGE_PATH=./storage-test/` with pre-generated fixture derivatives.
4. **Each test run starts with a fresh seed** -- delete and recreate test DB before suite.
5. **API-driven setup in tests** where possible: use the upload/create endpoints to set up data.

**Warning signs:**

- E2E tests pass locally, fail in CI
- Tests fail when run in a different order
- Tests fail after the developer deletes their test photos

**Phase to address:** E2E testing setup phase.

---

### Pitfall 13: Worker Event Handler Errors Are Not Retried

**What goes wrong:**
In `imageProcessor.ts`, the `completed` event handler (lines 105-132) updates the photo's status to "ready" and saves blur data, EXIF data, and dimensions. If `repository.save(photo)` fails here (DB locked, disk full), the error is caught and logged but NOT retried. The image files are already generated on disk, but the photo record stays in "processing" status forever. The BullMQ job is marked as completed (it did complete its main task), so BullMQ will not retry it.

Similarly, the `failed` event handler (lines 93-103) tries to set the photo status to "error", but if that DB update also fails, there is no fallback.

**Why it happens:**
BullMQ's retry mechanism applies to the main job processor function, not to event handlers. Event handlers fire after the job is already resolved. Errors in event handlers are fire-and-forget by design.

**How to avoid:**

1. **Move the database update INTO the main processor function** (return the result, have the processor itself update the DB). This way, if the DB update fails, the job itself fails and BullMQ retries it.
2. **Alternatively, add manual retry logic** in the completed handler: wrap `repository.save()` in a retry loop with exponential backoff.
3. **Add a "stuck processing" detection job**: periodically scan for photos with `status = "processing"` older than a threshold (e.g., 30 minutes) and either retry them or mark them as errored.
4. **Write tests for this specific failure mode**: mock `repository.save()` to throw in the completed handler and verify the photo can be recovered.

**Warning signs:**

- Photos stuck in "processing" status for hours/days
- Image files exist on disk but photo shows as "processing" in admin
- Worker logs show "Error updating status" but no follow-up

**Phase to address:** Error handling phase. This is a resilience gap.

---

## Technical Debt Patterns

| Shortcut                                                   | Immediate Benefit                                      | Long-term Cost                                                                                          | When Acceptable                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Module-level singletons (db, redis, queue)                 | Simple, no DI framework needed                         | Cannot swap test doubles without module mocking                                                         | Acceptable for small apps. Mitigate with vitest module mocking.                                                     |
| `initializeDatabase()` at import time                      | DB always ready when needed                            | Cannot test without filesystem; migration logic coupled with connection setup                           | Refactor to lazy init for testability, or accept module-level mocking as the solution.                              |
| Empty application service layer (`services/.gitkeep` only) | Routes call repositories directly -- simple and direct | Business logic scattered across route handlers and worker event handlers, harder to test in isolation   | Add services only where tests reveal duplicated or complex logic, not preemptively.                                 |
| No error types (string messages + generic Error)           | Fast to write                                          | Cannot programmatically distinguish error categories; catch blocks make binary handle/swallow decisions | Add typed errors in error handling phase. Keep it simple: `AppError` with `code` field, not a deep class hierarchy. |
| Repository instantiation in routes (not injected)          | No DI container needed                                 | Must mock at module level rather than passing test doubles                                              | Acceptable with vitest `vi.mock()`. Factory functions are a lighter alternative to full DI.                         |
| Silent Redis degradation                                   | Works in dev without Docker                            | Masks real failures in production; no visibility                                                        | Acceptable for dev, but production needs monitoring. Add structured logging in error handling phase.                |
| Console.log for all worker logging                         | Quick visibility during development                    | No structured logging, no log levels, no correlation IDs                                                | Replace with structured logger in hardening phase. At minimum, add log levels (info/warn/error).                    |

---

## Performance Traps

| Trap                                           | Symptoms                                                                       | Prevention                                                                                                                                                                         | When It Breaks                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `readFile()` loads entire image into memory    | Memory spike when serving images; slow response for large files                | Currently only serves processed derivatives (50-200KB), so acceptable. Would break if serving originals (~25MB for 50MP JPEG). Use `createReadStream()` if ever serving originals. | If original file access is ever added to the image API           |
| No pagination on `findAll()`                   | All photos/albums returned in single query and response                        | Add `limit`/`offset` to repository methods                                                                                                                                         | When library exceeds ~500 photos                                 |
| `ORDER BY RANDOM()` for homepage               | Full table scan on every homepage load                                         | Acceptable for <1000 published photos. At scale, use pre-computed random set refreshed periodically.                                                                               | Published photos >10,000                                         |
| Module-level IORedis connections (3 instances) | Connection established on import regardless of whether Redis features are used | Lazy initialization or connection pooling                                                                                                                                          | Any environment without Redis; causes test hangs (see Pitfall 4) |
| No connection pooling for SQLite               | better-sqlite3 is synchronous and single-connection by design                  | Not an issue for SQLite (single-writer, multi-reader). Would matter if migrating to PostgreSQL.                                                                                    | Not applicable for SQLite; flag if DB migration is ever planned  |
| Sequential photo deletion in album cascade     | `for (const photoId of deletedPhotoIds)` deletes one at a time                 | Use `Promise.all()` for parallel file deletion, or batch DB deletes                                                                                                                | Albums with >50 photos                                           |

---

## "Looks Done But Isn't" Checklist

These are items that APPEAR resolved but have subtle incomplete states. Verify each before closing.

- [ ] **coverPhotoId FK constraint:** The migration in `client.ts` (lines 96-128) fixes this by recreating the albums table with `ON DELETE SET NULL`. But the migration only triggers if `PRAGMA foreign_key_list(albums)` shows the wrong `on_delete` value. Verify on the ACTUAL production database with `PRAGMA foreign_key_list(albums)` -- do not assume the migration ran.

- [ ] **albums.tags column:** Only exists if the FK migration (above) fired and recreated the table, OR if `db:push` was run. The initial CREATE TABLE on line 38 does NOT include `tags`. Verify with `PRAGMA table_info(albums)`. If missing, write an explicit `ALTER TABLE albums ADD COLUMN tags TEXT` migration.

- [ ] **photo_albums.sortOrder after deletions:** `addToAlbum` calculates `max(sortOrder) + 1` for new entries, and `updatePhotoSortOrders` reassigns 0-based contiguous ordering when explicitly reordered. But removing a photo from an album does NOT compact the sort orders. After removing photo at position 2 from [0,1,2,3], you get [0,1,3]. This is functionally correct (ORDER BY still works) but may confuse admin UI if it displays sort order numbers.

- [ ] **Upload route silent failure:** Lines 81-84 catch Redis/queue errors with an empty catch body -- no logging at all. A photo uploaded when Redis is unavailable stays in "processing" status forever with absolutely no indication in logs. This is the most dangerous silent failure in the codebase.

- [ ] **Immutable cache headers on derivatives:** `Cache-Control: public, max-age=31536000, immutable` (line 75 of image route). If derivatives are regenerated (e.g., different quality settings, bug fix in processing), browsers will serve the old cached version until the cache expires (1 year) or the URL changes. Any reprocessing strategy must change the URL (e.g., add version hash).

- [ ] **Worker DB update in event handler:** The `completed` event handler updates photo status and metadata (lines 105-132). This runs AFTER BullMQ marks the job as completed. If the handler fails, the job is not retried. The photo has processed files on disk but is stuck in "processing" in the DB.

- [ ] **deleteWithPhotos is non-atomic:** Album deletion cascades junction entries (via FK), then a separate loop deletes photo records and files. If the loop fails mid-way, some photos are orphaned (no album association, but files and records exist). There is no transaction wrapping the full operation.

- [ ] **Stale JPEG comment:** The milestone context mentions a stale comment in imageProcessor.ts. The code only generates WebP + AVIF (confirmed in imageService.ts). If any comment references JPEG generation, it is misleading documentation, not a functional bug. Update the comment.

- [ ] **Docker build untested:** `next.config.ts` has `output: "standalone"` (correct for Docker). But Sharp's native binary needs platform-specific handling in Dockerfile (`--platform` flag or multi-stage build with platform-matching npm install). The user's MEMORY.md confirms Docker is not installed on the dev machine. Any Docker-related tests must run in CI only.

---

## Pitfall-to-Phase Mapping

| Pitfall                                | Prevention Phase                      | Verification                                         |
| -------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| 1. DB module side effects              | Testing infrastructure (FIRST)        | `vitest` runs with zero infrastructure, clean output |
| 2. `server-only` crashes Vitest        | Testing infrastructure (FIRST)        | All module mocks in place, no import crashes         |
| 3. Schema drift                        | Schema audit (FIRST) + testing setup  | PRAGMA tests pass against production DB              |
| 4. Redis module connections hang tests | Testing infrastructure (FIRST)        | Tests run without Redis, no hanging                  |
| 5. File-before-DB deletion race        | Error handling phase                  | Deletion order reversed; failure scenario tests pass |
| 6. Silent error swallowing             | Error handling phase                  | Error audit complete; no empty catch blocks          |
| 7. Mock repository divergence          | Testing infrastructure + repo testing | Contract tests for real vs in-memory repos           |
| 8. Server Component testing in Vitest  | Testing conventions (FIRST)           | Documented policy; no page.tsx imports in vitest     |
| 9. Sharp native binary in CI           | CI setup + test fixtures              | CI pipeline passes; Sharp mocked in unit tests       |
| 10. toDomain/toDatabase mapping bugs   | Repository testing phase              | Round-trip tests for all entities + edge cases       |
| 11. Performance without baselines      | Performance phase (FIRST task)        | Baseline doc with measured numbers exists            |
| 12. E2E data dependencies              | E2E testing setup                     | Seed script works; tests pass from clean state       |
| 13. Worker event handler no-retry      | Error handling phase                  | DB update moved to processor or retry logic added    |

---

## Phase Ordering Recommendations (from Pitfalls Perspective)

**Phase 1: Testing Infrastructure + Schema Audit**
Addresses pitfalls 1, 2, 3, 4, 8, 9. Blocks all other testing work.

- Vitest setup with global mocks (server-only, next/headers, next/navigation, next/cache, ioredis)
- Environment variable setup for tests
- Test database helper (temp file SQLite with full migration chain)
- Schema validation tests
- Sharp mock for unit tests
- Test fixture images
- Testing conventions document (what to test where)
- Production database schema audit

**Phase 2: Domain & Repository Testing**
Addresses pitfalls 7, 10.

- In-memory repository implementations
- Contract tests (real vs in-memory)
- Round-trip serialization tests
- Edge case coverage for all entity fields

**Phase 3: Error Handling Hardening**
Addresses pitfalls 5, 6, 13.

- Audit existing catch blocks (classify each)
- Fix deletion ordering (DB before files)
- Fix worker event handler resilience
- Add logging to silent catch blocks (especially upload route)
- Add typed error codes where needed
- Test error paths explicitly

**Phase 4: API Route & Server Action Testing**
Depends on phases 1-3.

- Category-specific test patterns (CRUD, upload, image serving, auth)
- Request validation tests
- Auth flow tests
- Error response tests

**Phase 5: Performance Baselining & Targeted Optimization**
Addresses pitfall 11.

- Measure baselines (Lighthouse, API timing, worker throughput)
- Identify actual bottlenecks from data
- Apply targeted optimizations with before/after measurements
- Set performance budgets

**Phase 6: E2E Testing with Playwright**
Addresses pitfall 12.

- Test seed script
- Isolated test database and storage
- Critical path E2E tests (upload, organize, publish, view)
- CI integration

---

## Sources

All findings based on direct analysis of the codebase at `/Users/arxherre/Documents/photo-profile/`. Key files examined:

| File                                                                | Relevance                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/infrastructure/database/client.ts`                             | Pitfalls 1, 3 (module-level init, schema drift)                                           |
| `src/infrastructure/database/schema.ts`                             | Pitfall 3 (desired schema vs actual)                                                      |
| `src/infrastructure/database/repositories/SQLitePhotoRepository.ts` | Pitfalls 7, 10 (mock divergence, serialization)                                           |
| `src/infrastructure/database/repositories/SQLiteAlbumRepository.ts` | Pitfalls 7, 10 (mock divergence, serialization)                                           |
| `src/infrastructure/config/env.ts`                                  | Pitfall 1 (env validation at import)                                                      |
| `src/infrastructure/auth/session.ts`                                | Pitfall 2 (server-only import)                                                            |
| `src/infrastructure/auth/dal.ts`                                    | Pitfall 2 (server-only, cookies, cache)                                                   |
| `src/infrastructure/auth/rateLimiter.ts`                            | Pitfall 4 (module-level Redis)                                                            |
| `src/infrastructure/jobs/queues.ts`                                 | Pitfall 4 (module-level Redis)                                                            |
| `src/infrastructure/jobs/workers/imageProcessor.ts`                 | Pitfalls 4, 6, 13 (Redis, error swallowing, event handler)                                |
| `src/infrastructure/services/imageService.ts`                       | Pitfall 9 (Sharp native binary)                                                           |
| `src/infrastructure/services/exifService.ts`                        | Pitfall 9 (Sharp native binary)                                                           |
| `src/infrastructure/storage/fileStorage.ts`                         | Pitfall 5 (file deletion)                                                                 |
| `src/app/api/admin/upload/route.ts`                                 | Pitfalls 4, 6 (Redis dependency, silent failure)                                          |
| `src/app/api/admin/photos/[id]/route.ts`                            | Pitfall 5 (deletion ordering)                                                             |
| `src/app/api/admin/albums/[id]/route.ts`                            | Pitfall 5 (cascade deletion atomicity)                                                    |
| `src/app/api/images/[photoId]/[filename]/route.ts`                  | Pitfall 6 (silent error in fallback)                                                      |
| `src/app/admin/(protected)/layout.tsx`                              | Pitfall 8 (Server Component testing)                                                      |
| `src/app/actions/auth.ts`                                           | Pitfall 2 (server action with redirect)                                                   |
| `vitest.config.ts`                                                  | Pitfall 1 (current test setup has no mocks)                                               |
| `src/__tests__/theme-tokens.test.ts`                                | Only existing test, reads CSS file directly -- shows no infrastructure mocking exists yet |

**Confidence notes:** WebSearch was unavailable during this research. All critical pitfalls (1-7) were identified directly from codebase analysis and are **HIGH confidence**. Moderate pitfalls (8-13) combine codebase analysis with general Next.js/Vitest testing patterns from training data -- these are **MEDIUM-HIGH confidence** for the general concepts, though specific Vitest API behaviors for Next.js 16 may have changed since training cutoff.

---

_Pitfalls research for: Retrofitting quality into Photo Profile (Next.js 16 photography portfolio)_
_Researched: 2026-02-06_
