# Architecture Research: Quality & Hardening for Clean Architecture Next.js App

**Domain:** Testing, Error Handling & Performance Optimization
**Researched:** 2026-02-06
**Confidence:** HIGH (patterns well-established; codebase deeply analyzed)

## Executive Summary

The existing Photo Portfolio codebase follows Clean Architecture with four clear layers (domain, application, infrastructure, presentation) plus the Next.js App Router layer. The quality/hardening work integrates naturally because Clean Architecture **was designed for testability** -- the domain and application layers have no external dependencies, making them trivially unit-testable. The infrastructure layer uses the repository pattern with interfaces, enabling mock-based testing of business logic without SQLite/Redis/filesystem.

The codebase currently has zero error boundaries, zero `error.tsx` files, zero `not-found.tsx` files, and zero `loading.tsx` files. API routes have ad-hoc error handling (some catch errors, others let them propagate uncaught). The BullMQ worker has error handlers but no retry-with-status-recovery pattern. There is a single test file (`__tests__/theme-tokens.test.ts`) using Vitest. Playwright is installed but unconfigured.

**Key architectural insight:** The application layer is empty (`services/.gitkeep`). Business logic lives directly in API route handlers. This means:

1. Unit tests must test API route handlers OR extract business logic into application services first
2. Error handling is duplicated across every route handler (auth check, validation, repo call)
3. The recommendation is to NOT extract services now -- test at the API route integration level and add services only when duplication becomes painful

## Existing Architecture Reference (Current State)

```
src/
  domain/
    entities/         Photo.ts, Album.ts (interfaces only, no logic)
    repositories/     PhotoRepository.ts, AlbumRepository.ts (interfaces)
  application/
    services/         .gitkeep (EMPTY -- business logic is in API routes)
  infrastructure/
    auth/             dal.ts, session.ts, password.ts, rateLimiter.ts
    config/           env.ts (Zod-validated environment)
    database/         client.ts, schema.ts, repositories/ (SQLite implementations)
    jobs/             queues.ts, worker.ts, workers/imageProcessor.ts
    services/         imageService.ts, exifService.ts
    storage/          fileStorage.ts
  presentation/
    components/       20 components (PhotoGrid, UploadQueue, Lightbox, etc.)
    lib/              uploadFile.ts
  app/
    layout.tsx        Root layout (no error boundary)
    page.tsx          Homepage (Server Component)
    albums/           Public album pages
    photo/[slug]/     Public photo permalink
    admin/            Protected admin pages
    api/              8 API route files across 6 endpoints
    actions/          auth.ts (server action for login)
  __tests__/
    theme-tokens.test.ts  (single existing test)
  proxy.ts            Edge route protection
```

**Critical observations for quality work:**

1. **No error boundaries anywhere** -- any server component error crashes the entire page
2. **No error.tsx files** -- Next.js has no fallback UI for runtime errors
3. **No not-found.tsx files** -- 404s show the default Next.js page
4. **No loading.tsx files** -- no streaming/Suspense boundaries
5. **API routes have repetitive auth + validation boilerplate** -- 8 route files all start with `verifySession()` check
6. **Worker error handling updates status to "error" but has no recovery mechanism** -- photos stuck in "error" status forever
7. **Database client initializes on module load** -- `initializeDatabase()` called at import time, making it hard to mock
8. **Infrastructure services are pure functions** -- `generateDerivatives`, `extractExifData`, `generateBlurPlaceholder` are stateless, easily testable
9. **Repositories are classes implementing interfaces** -- classic dependency inversion, ideal for mocking

## Recommended Test File Structure

### Organization Strategy: Colocated with Source, Mirroring Architecture Layers

```
src/
  domain/
    entities/
      __tests__/
        Photo.test.ts         # Entity validation/construction tests
        Album.test.ts         # Entity validation/construction tests
  infrastructure/
    database/
      repositories/
        __tests__/
          SQLitePhotoRepository.integration.test.ts  # Real SQLite, in-memory DB
          SQLiteAlbumRepository.integration.test.ts   # Real SQLite, in-memory DB
    services/
      __tests__/
        imageService.test.ts     # Mock Sharp, test pipeline logic
        exifService.test.ts      # Test with fixture images
    auth/
      __tests__/
        session.test.ts          # JWT encrypt/decrypt cycle
        rateLimiter.test.ts      # Mock Redis client
    storage/
      __tests__/
        fileStorage.test.ts      # Test with temp directories
    jobs/
      __tests__/
        queues.test.ts           # Enqueue logic (mock IORedis)
  presentation/
    components/
      __tests__/
        PhotoGrid.test.tsx       # Render tests (if React Testing Library added)
        UploadQueue.test.tsx     # State/UI tests
  app/
    api/
      __tests__/
        upload.integration.test.ts     # Full upload flow
        photos.integration.test.ts     # CRUD operations
        albums.integration.test.ts     # CRUD + reorder
        images.integration.test.ts     # Image serving + fallback
  __tests__/
    theme-tokens.test.ts    # (existing)

tests/                       # E2E tests (Playwright)
  e2e/
    public-gallery.spec.ts   # Public pages load, images display
    admin-login.spec.ts      # Login flow, rate limiting
    upload-flow.spec.ts      # Upload, processing status, gallery display
    album-management.spec.ts # CRUD, reorder, publish
  fixtures/
    test-image.jpg           # Small test image with EXIF data
    test-image-no-exif.png   # Image without EXIF
  playwright.config.ts
```

### Why Colocated `__tests__/` Over Top-Level `tests/`

1. **Matches existing pattern** -- the codebase already has `src/__tests__/`
2. **Import paths stay short** -- `../Photo` instead of `../../../../src/domain/entities/Photo`
3. **Layer isolation visible** -- if `domain/__tests__/` imports from `infrastructure/`, the test is wrong
4. **Vitest glob works** -- existing config has no include restrictions, `**/*.test.{ts,tsx}` works

### Vitest Configuration Updates Needed

The existing `vitest.config.ts` needs additions for:

```typescript
// vitest.config.ts additions needed:
{
  test: {
    globals: true,
    environment: "node",
    // NEW: separate integration tests (need real DB)
    // by convention: *.integration.test.ts
    include: ["src/**/*.test.{ts,tsx}", "src/**/*.integration.test.{ts,tsx}"],
    // NEW: setup file for test database
    setupFiles: ["./src/test-setup.ts"],
    // NEW: coverage configuration
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/app/layout.tsx",     // Layout is trivial
        "src/proxy.ts",           // Edge runtime, hard to unit test
      ],
    },
  },
}
```

## Component Responsibilities: New vs Modified

### New Files to Create

| File                                  | Layer      | Purpose                                              | Type |
| ------------------------------------- | ---------- | ---------------------------------------------------- | ---- |
| `src/app/error.tsx`                   | app        | Root error boundary, catches unhandled errors        | NEW  |
| `src/app/not-found.tsx`               | app        | Custom 404 page                                      | NEW  |
| `src/app/admin/error.tsx`             | app        | Admin-specific error boundary                        | NEW  |
| `src/app/admin/(protected)/error.tsx` | app        | Protected admin error boundary                       | NEW  |
| `src/app/albums/[id]/not-found.tsx`   | app        | Album not found page                                 | NEW  |
| `src/app/albums/[id]/loading.tsx`     | app        | Album loading skeleton                               | NEW  |
| `src/lib/errors.ts`                   | lib        | Custom error classes (AppError, NotFoundError, etc.) | NEW  |
| `src/test-setup.ts`                   | root       | Vitest setup (test DB, env mocks)                    | NEW  |
| `tests/playwright.config.ts`          | root       | Playwright E2E config                                | NEW  |
| `tests/e2e/*.spec.ts`                 | root       | E2E test files                                       | NEW  |
| `src/*/__tests__/*.test.ts`           | all layers | Unit/integration tests                               | NEW  |

### Modified Files

| File                                                | Layer | Change                                       | Why                 |
| --------------------------------------------------- | ----- | -------------------------------------------- | ------------------- |
| `vitest.config.ts`                                  | root  | Add coverage, setupFiles, include patterns   | Test infrastructure |
| `package.json`                                      | root  | Add test scripts, @testing-library if needed | Test infrastructure |
| `src/infrastructure/database/client.ts`             | infra | Extract DB creation for test injection       | Testability         |
| `src/app/page.tsx`                                  | app   | Add try/catch or let error.tsx handle        | Error recovery      |
| `src/app/albums/[id]/page.tsx`                      | app   | Call `notFound()` for missing albums         | Proper 404s         |
| `src/app/admin/(protected)/page.tsx`                | app   | Add error boundary awareness                 | Error recovery      |
| API route files (8 files)                           | app   | Wrap with consistent error handling helper   | Error consistency   |
| `src/infrastructure/jobs/workers/imageProcessor.ts` | infra | Add stalled job recovery                     | Resilience          |

## Architectural Patterns

### Pattern 1: Error Handling Strategy Per Layer

The principle: **each layer handles errors it understands, propagates errors it does not**.

```
Layer Responsibility Chain:

  domain/           No error handling. Pure interfaces, no logic.
       |
  application/      (Empty today.) Would catch domain validation errors,
       |            translate to application-level errors.
       |
  infrastructure/   Catches external system errors (DB, filesystem, Redis, Sharp).
       |            Translates to domain-meaningful errors or returns null.
       |            Examples: session.ts decrypt returns null on invalid JWT,
       |            exifService returns null on corrupt EXIF, rateLimiter
       |            degrades gracefully when Redis is down.
       |
  app/api/          Catches validation errors (Zod), auth errors,
       |            not-found errors. Returns appropriate HTTP status codes.
       |            SHOULD catch unexpected errors with try/catch wrapper.
       |
  app/pages/        Server Components should catch data-fetch errors.
       |            error.tsx catches anything that propagates uncaught.
       |
  presentation/     Client components handle UI-level errors
                    (upload failures, network errors). Error boundaries
                    catch render crashes.
```

**Specific recommendations per file:**

| File                       | Current Error Handling              | Recommended Change                                                       |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `SQLitePhotoRepository.ts` | None (Drizzle throws)               | Add try/catch in `save()` for constraint violations, return typed errors |
| `SQLiteAlbumRepository.ts` | None (Drizzle throws)               | Same as above                                                            |
| `imageService.ts`          | None (Sharp throws)                 | Already used within worker try/catch. Add specific Sharp error types     |
| `exifService.ts`           | try/catch returns null              | Good. Keep as-is.                                                        |
| `session.ts`               | try/catch returns null              | Good. Keep as-is.                                                        |
| `rateLimiter.ts`           | try/catch with graceful degradation | Good. Keep as-is.                                                        |
| `fileStorage.ts`           | None (fs throws)                    | Add ENOSPC/EACCES handling for disk-full and permission errors           |
| API routes (all 8)         | Auth check + partial validation     | Add consistent try/catch wrapper                                         |
| Worker imageProcessor      | Has error/failed handlers           | Add stalled job detection and status recovery                            |
| Server Component pages     | None                                | Let error.tsx handle via Next.js error boundary                          |

### Pattern 2: Error Boundary Placement in Next.js App Router

Next.js App Router uses `error.tsx` files as React Error Boundaries. They catch errors in their route segment and all child segments.

**Recommended error boundary tree:**

```
app/
  error.tsx                              ← ROOT: catches all unhandled errors
  not-found.tsx                          ← ROOT: custom 404 page
  layout.tsx                             ← (no change)
  page.tsx                               ← Homepage errors caught by app/error.tsx
  albums/
    [id]/
      error.tsx                          ← Album-specific: "Album failed to load" + retry
      not-found.tsx                      ← "Album not found"
      loading.tsx                        ← Skeleton while Server Component loads
  photo/
    [slug]/
      (errors caught by app/error.tsx)   ← No separate boundary needed (simple page)
  admin/
    error.tsx                            ← Admin area: "Something went wrong" + link to dashboard
    login/
      (errors caught by admin/error.tsx)
    (protected)/
      error.tsx                          ← Protected area: "Error loading admin" + retry
```

**Why this structure:**

1. **Root `error.tsx`** -- Catches any unhandled error from any page. Shows generic "Something went wrong" with a "Try again" button. This is the safety net.
2. **`albums/[id]/error.tsx`** -- Album pages are the most likely to error (dynamic data, database queries). Specific error UI: "Failed to load album" with retry button.
3. **`albums/[id]/not-found.tsx`** -- When `findById` returns null, the page calls Next.js `notFound()` function to trigger this.
4. **`admin/error.tsx`** -- Admin errors should not expose stack traces. Show "Something went wrong" with link to dashboard.
5. **`admin/(protected)/error.tsx`** -- Catches errors within authenticated admin pages. Can show more detail since user is authenticated.

**What NOT to do:**

- Do NOT add error.tsx to every route segment. Granularity should match user experience boundaries, not file boundaries.
- Do NOT add loading.tsx everywhere. Only where Server Components do slow async work (album page with photo queries).

### Pattern 3: API Route Error Handling Wrapper

Currently every API route has duplicated auth checking and no consistent error handling. A utility function eliminates this.

**Recommended pattern -- lightweight wrapper, not middleware:**

```typescript
// src/app/api/_lib/handler.ts (NEW)
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

export function withAuth(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      return await handler(request, context);
    } catch (error) {
      console.error("[API Error]", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
```

**Trade-off note:** This wrapper is optional. The current approach (explicit auth check per route) is clear and readable. The wrapper reduces duplication but adds indirection. For 8 routes, the duplication is tolerable. **Recommendation:** Add the try/catch wrapper for error logging/consistency, but keep auth checks explicit for clarity.

### Pattern 4: Test Organization for Clean Architecture

**Layer-by-layer testing strategy:**

| Layer                     | Test Type       | What to Test                               | What to Mock                            |
| ------------------------- | --------------- | ------------------------------------------ | --------------------------------------- |
| `domain/entities`         | Unit            | Entity construction, validation            | Nothing (pure interfaces)               |
| `domain/repositories`     | N/A             | Interfaces only, nothing to test           | N/A                                     |
| `infrastructure/database` | Integration     | Repository CRUD, transactions, constraints | Nothing -- use real in-memory SQLite    |
| `infrastructure/services` | Unit            | Sharp pipeline logic, EXIF extraction      | Sharp (or use small fixture images)     |
| `infrastructure/auth`     | Unit            | JWT lifecycle, password verification       | Nothing (jose is fast enough)           |
| `infrastructure/storage`  | Integration     | File save/delete, directory creation       | Nothing -- use temp directories         |
| `infrastructure/jobs`     | Unit            | Job enqueueing, queue configuration        | IORedis/BullMQ                          |
| `app/api`                 | Integration     | Full HTTP request/response cycle           | Database (in-memory), filesystem (temp) |
| `presentation/components` | Unit (optional) | Render output, interaction handlers        | API calls                               |
| E2E (Playwright)          | E2E             | Critical user flows                        | Nothing -- real app                     |

**Testing the database layer (integration):**

The `client.ts` module initializes the database at import time (`initializeDatabase()` called at module scope). This makes it hard to swap in a test database. The fix is small:

```typescript
// Current (hard to test):
const sqlite = new Database(dbPath);
export const db = drizzle({ client: sqlite, schema });
initializeDatabase(); // runs at import time

// Testable (extract factory):
export function createDatabase(path: string) {
  const sqlite = new Database(path);
  const db = drizzle({ client: sqlite, schema });
  // ... initialization ...
  return db;
}
export const db = createDatabase(dbPath); // default for production
```

Then in tests: `createDatabase(":memory:")` for fast, isolated integration tests.

**Testing infrastructure services:**

`imageService.ts` and `exifService.ts` are pure functions that take file paths and return results. They can be tested with small fixture images (a 10x10 JPEG is fine) without mocking Sharp. This gives higher confidence than mock-based tests.

**Testing API routes:**

Next.js API routes are just async functions that take `NextRequest` and return `NextResponse`. They can be tested by constructing request objects directly:

```typescript
import { POST } from "@/app/api/admin/albums/route";

const request = new NextRequest("http://localhost/api/admin/albums", {
  method: "POST",
  body: JSON.stringify({ title: "Test Album" }),
  headers: { "Content-Type": "application/json" },
});
const response = await POST(request);
expect(response.status).toBe(201);
```

The challenge is mocking `verifySession()` (uses `cookies()` from Next.js). Options:

1. Mock the `@/infrastructure/auth` module in Vitest
2. Create a test helper that sets up session cookies
3. Test at E2E level with Playwright (recommended for auth flows)

### Pattern 5: Performance Monitoring Integration Points

Performance optimizations integrate at specific points in the existing architecture:

**Image Serving (`/api/images/[photoId]/[filename]/route.ts`):**

- Current: Reads file from disk on every request, returns with `Cache-Control: immutable`
- Optimization: Add `ETag` header based on file stat mtime. Add `If-None-Match` / `304 Not Modified` support. This reduces bandwidth for re-requests.
- Integration point: Modify the `serveImage` function only.

**Server Components (pages):**

- Current: `force-dynamic` on homepage, no caching hints elsewhere
- Optimization: Add `revalidate` export for semi-static pages. Homepage could revalidate every 60s instead of being fully dynamic.
- Integration point: Add `export const revalidate = 60` to page files.

**Database Queries:**

- Current: Simple queries, no optimization needed at this scale
- Potential: Add WAL mode for concurrent reads during writes. One-line change: `sqlite.pragma("journal_mode = WAL")`
- Integration point: `infrastructure/database/client.ts`

**Image Processing Worker:**

- Current: Processes sequentially within each job, concurrency=2
- Optimization: Process WebP and AVIF for same size in parallel (they use `.clone()` already but `await` sequentially)
- Integration point: `infrastructure/services/imageService.ts` -- change sequential awaits to `Promise.all`

**Bundle Size:**

- Current: `PhotoLightbox` is already dynamically imported. Good.
- Audit: Check for unnecessary client-side JS. `PhotoGrid` (200 lines) is imported in admin but is not marked "use client" -- it is a Server Component when used in pages. Good.

## Data Flow: Error Propagation

### Current Error Propagation (No Boundaries)

```
User visits /albums/[id] where id doesn't exist
  → Server Component calls photoRepository.findByAlbumId(id)
    → Drizzle query returns empty array (not an error)
    → Page renders empty state
    (This case is handled)

User visits /albums/[id] where database is corrupted
  → Server Component calls photoRepository.findByAlbumId(id)
    → Drizzle throws SqliteError
      → Error propagates to Next.js runtime
        → Next.js shows default error page (ugly, no retry)
        (This case is NOT handled)

Admin uploads file but disk is full
  → API route calls saveOriginalFile(photoId, file)
    → fs.writeFile throws ENOSPC
      → Error propagates to API route
        → API route has no try/catch
          → Next.js returns 500 with generic error
          (This case is NOT handled)
```

### Recommended Error Propagation (With Boundaries)

```
User visits /albums/[id] where database is corrupted
  → Server Component calls photoRepository.findByAlbumId(id)
    → Drizzle throws SqliteError
      → Error caught by albums/[id]/error.tsx
        → Shows "Failed to load album" + retry button
        → Logs error for debugging

Admin uploads file but disk is full
  → API route calls saveOriginalFile(photoId, file)
    → fs.writeFile throws ENOSPC
      → Try/catch in API route catches error
        → Returns { error: "Storage full" }, status: 507
        → Client shows error in UploadQueue component

Worker fails to process image after 3 retries
  → BullMQ marks job as failed
    → Worker "failed" handler sets photo.status = "error"
      → Admin dashboard shows error badge
        → Admin can trigger reprocess (NEW: recovery endpoint)
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Over-Testing Trivial Code

**What:** Writing unit tests for `Photo.ts` and `Album.ts` entity interfaces
**Why bad:** These are TypeScript interfaces with zero logic. Tests would just assert that TypeScript types work, which the compiler already guarantees.
**Instead:** Test the code that USES these entities -- repositories and API routes.

### Anti-Pattern 2: Mocking the Database for Repository Tests

**What:** Mocking `db.select().from().where()` chain in SQLitePhotoRepository tests
**Why bad:** You are testing that your mock matches Drizzle's API, not that your queries work. The mock becomes brittle and meaningless.
**Instead:** Use real SQLite with `:memory:` mode. Fast, accurate, no mocking needed.

### Anti-Pattern 3: Error Boundaries That Swallow Errors

**What:** `error.tsx` that catches errors but does not log them
**Why bad:** Errors are hidden from the developer. Users see a nice page but bugs are never found.
**Instead:** Always log the error in error.tsx's `useEffect`, then show recovery UI.

### Anti-Pattern 4: Testing Implementation Details

**What:** Testing that `SQLitePhotoRepository.save()` calls `db.insert().values().onConflictDoUpdate()`
**Why bad:** If the implementation changes (e.g., uses raw SQL), the test breaks despite correct behavior.
**Instead:** Test behavior: save a photo, find it by ID, verify fields match.

### Anti-Pattern 5: Global Error Boundary Only

**What:** Adding just one `app/error.tsx` and considering error handling "done"
**Why bad:** Every error shows the same generic message. User has no context about what failed or how to recover.
**Instead:** Add error boundaries at route segment boundaries where the error message differs (root, album detail, admin).

### Anti-Pattern 6: Testing Server Components Directly

**What:** Importing and calling Server Components in Vitest like regular functions
**Why bad:** Server Components use `async/await` at the component level, `cookies()`, `headers()`, and other server-only APIs that do not work outside the Next.js runtime.
**Instead:** Test Server Component data-fetching logic separately. Test the full page with Playwright E2E tests.

## Integration Points Summary

### Where New Code Connects to Existing Architecture

| Integration Point | What Connects       | Existing File                                  | Change Type                          |
| ----------------- | ------------------- | ---------------------------------------------- | ------------------------------------ |
| Error boundaries  | error.tsx files     | `app/` directory                               | NEW files alongside existing pages   |
| Not-found pages   | not-found.tsx files | `app/` directory                               | NEW files alongside existing pages   |
| API error wrapper | Handler utility     | `app/api/` routes                              | NEW utility, MODIFY routes to use it |
| Test setup        | Database factory    | `infrastructure/database/client.ts`            | MODIFY to export factory             |
| Test fixtures     | JPEG/PNG test files | `tests/fixtures/`                              | NEW directory                        |
| Repository tests  | In-memory SQLite    | `infrastructure/database/repositories/`        | NEW test files                       |
| Service tests     | Fixture images      | `infrastructure/services/`                     | NEW test files                       |
| Worker recovery   | Retry endpoint      | `app/api/admin/photos/[id]/` route             | MODIFY to add reprocess action       |
| Performance: WAL  | SQLite pragma       | `infrastructure/database/client.ts`            | MODIFY (one line)                    |
| Performance: ETag | Image serving       | `app/api/images/[photoId]/[filename]/route.ts` | MODIFY serveImage function           |
| E2E tests         | Full app testing    | Root `tests/` directory                        | NEW                                  |
| Playwright config | E2E runner          | Root                                           | NEW file                             |

### Dependency Graph for Implementation Order

```
Phase 1: Test Infrastructure (foundation -- everything depends on this)
  ├── vitest.config.ts updates
  ├── test-setup.ts (DB factory, env mocks)
  ├── playwright.config.ts
  └── test fixture files

Phase 2: Error Handling (independent of tests)
  ├── Custom error classes (src/lib/errors.ts)
  ├── error.tsx files (root, albums/[id], admin, admin/(protected))
  ├── not-found.tsx files (root, albums/[id])
  └── API route error consistency

Phase 3: Unit & Integration Tests (depends on Phase 1)
  ├── Infrastructure tests (repositories, services, auth)
  ├── API route integration tests
  └── Coverage reporting

Phase 4: E2E Tests (depends on Phase 1, Phase 2)
  ├── Public gallery flows
  ├── Admin login flow
  ├── Upload and processing flow
  └── Album management flow

Phase 5: Performance (independent, can be parallel)
  ├── WAL mode for SQLite
  ├── ETag/304 for image serving
  ├── Image processing parallelization
  └── Page revalidation hints
```

## Confidence Assessment

| Area                                     | Confidence | Rationale                                                                                                 |
| ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| Test file structure                      | HIGH       | Standard Vitest colocated pattern, matches existing `__tests__/` convention                               |
| Error boundary placement                 | HIGH       | Next.js App Router error.tsx is well-documented, placement follows route hierarchy                        |
| API error handling                       | HIGH       | Standard try/catch patterns, Zod validation already in use                                                |
| Repository testing with in-memory SQLite | HIGH       | better-sqlite3 supports `:memory:` natively, Drizzle works identically                                    |
| Worker error recovery                    | MEDIUM     | BullMQ stalled job handling needs configuration verification                                              |
| Performance: WAL mode                    | HIGH       | Standard SQLite optimization, one pragma call                                                             |
| Performance: ETag/304                    | HIGH       | Standard HTTP caching, small change to existing route                                                     |
| Performance: image parallelization       | MEDIUM     | Sharp clone() should support parallel output, but memory implications with large images need verification |
| E2E test patterns                        | MEDIUM     | Playwright is installed but unconfigured; auth flow testing with cookies needs investigation              |

## Sources

- Codebase analysis: All files in `src/` examined directly (HIGH confidence)
- Vitest 4.x: Installed at version 4.0.18, configuration verified from `vitest.config.ts`
- Playwright: Installed at version 1.58.2, no config file exists yet
- Next.js 16: Installed at version 16.1.6, App Router patterns verified from existing code
- better-sqlite3: Supports `:memory:` databases (verified from npm docs, standard SQLite feature)
- Drizzle ORM: Repository pattern verified from existing implementations
- BullMQ: Job retry/failure patterns verified from existing `queues.ts` configuration (3 retries, exponential backoff)

---

_Architecture research for: Quality & Hardening (v1.2)_
_Researched: 2026-02-06_
