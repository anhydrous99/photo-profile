# Feature Research: Quality & Hardening

**Domain:** Photography portfolio -- quality hardening for production readiness
**Researched:** 2026-02-06
**Confidence:** HIGH (based on thorough codebase audit of all source files + domain knowledge of Next.js/testing patterns)

## Current State Assessment

Before defining features, here is what the codebase audit revealed:

**Testing:** 1 test file exists (`theme-tokens.test.ts` -- CSS token validation). Vitest is configured with path aliases. Playwright is a dev dependency but has no config file or test files. Effectively zero functional test coverage across ~6,043 LOC.

**Error boundaries:** Zero `error.tsx`, `loading.tsx`, or `not-found.tsx` files anywhere in the app. Server component errors render the Next.js default error page. Client component errors are unhandled at the boundary level (individual components have local try/catch but nothing catches a full render crash).

**API route validation:** Inconsistent. Album routes use Zod schemas (`updateAlbumSchema`, `createAlbumSchema`, `reorderSchema`). Photo PATCH route does raw `request.json()` with no validation -- `body as { description: string | null }` is a type assertion, not a runtime check. Upload route validates file type but not file size.

**Worker error handling:** Worker has `failed` event handler that sets photo status to `"error"`, but there is no mechanism for the admin to retry a failed job, see why it failed, or reprocess a photo. Photos stuck in `"processing"` status after Redis timeout are orphans with no recovery path. The upload route silently swallows Redis errors in a catch block with no comment to the user.

**Database integrity:** Known FK constraint mismatch on `coverPhotoId` (schema says `SET NULL`, actual DB may have `NO ACTION`). No database health checks or migration validation. `SQLitePhotoRepository.toDomain()` does `JSON.parse(row.exifData)` with no try/catch -- corrupt JSON will crash any page that loads photos.

**Performance:** Homepage has `force-dynamic` which disables caching. Image API serves files with `immutable` cache headers (good). No `loading.tsx` means no streaming/Suspense for server components. `findAll()` queries have no pagination.

**Client error states:** Most client components have decent optimistic update patterns with rollback on error (AlbumDetailClient, AlbumsPageClient, AlbumSelector). But errors auto-dismiss after 3 seconds with no way to persist or copy error details. PhotoDetail uses `alert()` for delete failure and `confirm()` for delete confirmation -- not accessible, not styled.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that are baseline requirements for a production application. Missing these means the app will crash, confuse users, or lose data in predictable scenarios.

| #   | Feature                                      | Why Expected                                                                                                                                                                                          | Complexity | Depends On                   | Notes                                                                                                                                                    |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **Error boundaries (error.tsx)**             | Uncaught server/client errors currently show Next.js default error page or white screen. Users need a recoverable error state with a retry button, not a crash.                                       | Low        | --                           | Need at minimum: root `app/error.tsx`, root `app/global-error.tsx`, `app/admin/(protected)/error.tsx`, and public route `error.tsx`. Each is ~20-30 LOC. |
| T2  | **Not-found pages (not-found.tsx)**          | Albums and photos call `notFound()` but there are no custom not-found pages. Users see the generic Next.js 404 with no site navigation or styling.                                                    | Low        | --                           | Root `app/not-found.tsx` with nav header and link back to home.                                                                                          |
| T3  | **API route input validation**               | Photo PATCH route trusts client input without validation (`body as { description }`). Upload route has no file size limit. Malformed JSON crashes `request.json()` calls that lack try/catch.         | Low        | Zod (already installed)      | Audit all 8 API route files. 5 already use Zod. Standardize the remaining 3.                                                                             |
| T4  | **API route error handling**                 | Multiple `request.json()` calls have no try/catch. Invalid JSON body crashes routes with a 500. Database errors propagate as unstructured 500s.                                                       | Low        | T3                           | Wrap routes in consistent try/catch or create a utility wrapper.                                                                                         |
| T5  | **Unit tests for domain and infrastructure** | Zero test coverage on core logic. Repository `toDomain`/`toDatabase` mappings, image loader, env config validation, file storage, and EXIF extraction are all untested. Regressions are undetectable. | Medium     | Vitest (configured)          | Highest-value targets: imageLoader, env validation, repository mappers, image service pure functions. ~15-20 test files.                                 |
| T6  | **Worker failure recovery**                  | Photos stuck in `"processing"` (Redis unavailable) or `"error"` (Sharp crash) have no admin-visible recovery path. Admin cannot retry, reprocess, or see failure reasons.                             | Medium     | Worker infrastructure exists | Need: admin UI filtering for stuck/error photos, retry action that re-enqueues the job, cleanup for orphaned processing entries.                         |
| T7  | **Database JSON parsing safety**             | `SQLitePhotoRepository.toDomain()` does `JSON.parse(row.exifData)` with no try/catch. Corrupt or malformed EXIF JSON will crash any page that loads photos (homepage, album pages, admin dashboard).  | Low        | --                           | Single try/catch with fallback to null. Apply to any JSON column parsing.                                                                                |
| T8  | **File size limit on uploads**               | Upload route validates file type but not size. The handler calls `file.arrayBuffer()` which loads the entire file into memory. A 2GB upload will exhaust Node.js memory.                              | Low        | --                           | Check `file.size` before `arrayBuffer()`. Reject files over configured max (e.g., 100MB for high-res photography).                                       |
| T9  | **Consistent error response format**         | API routes return different error shapes: `{ error: string }`, `{ error: string, details: object }`, plain text `"Invalid filename"`. Client code must handle multiple formats.                       | Low        | T4                           | Define a standard `ApiError` response type. Apply consistently across all routes.                                                                        |
| T10 | **Loading states for server components**     | No `loading.tsx` files anywhere. Page transitions show a blank white area while server components fetch from SQLite. Users see a flash of empty content on every navigation.                          | Low        | --                           | Add `loading.tsx` with simple skeleton/spinner at key route segments: root, admin, albums.                                                               |

### Differentiators (Competitive Advantage in Polish)

Features that distinguish a well-built app from a functional-but-rough one. Not expected by users, but their presence signals production quality.

| #   | Feature                                       | Value Proposition                                                                                                                                                                                                                   | Complexity | Depends On                     | Notes                                                                                                                                                                         |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Integration tests for API routes**          | Verify full request-to-response cycle including auth checks, Zod validation, database operations, and error responses. Catches regressions that unit tests miss because they test the wiring between layers.                        | Medium     | T3, T4, Vitest                 | Test each route handler function directly in Vitest with mock/test DB. ~8 test suites for 8 route files.                                                                      |
| D2  | **E2E smoke tests with Playwright**           | Verify the 3-4 critical user flows end-to-end: admin login, photo upload, album creation, public gallery viewing. Catches integration bugs across client/server boundary that no other test type can find.                          | High       | Playwright config, running app | Need Playwright config, test fixtures, CI integration. 3-5 targeted tests, NOT comprehensive suite.                                                                           |
| D3  | **Database FK constraint fix (coverPhotoId)** | Known mismatch: schema says `SET NULL` on photo delete, actual DB may have `NO ACTION`. Deleting a photo used as an album cover could fail with a FK constraint error or leave a dangling reference.                                | Low        | --                             | One-off migration script using `ALTER TABLE`. Already documented in project memory as known tech debt.                                                                        |
| D4  | **Structured logging**                        | Currently uses `console.log`/`console.error` with string interpolation. No log levels, no structured format, no request context. Debugging production issues requires grepping through unstructured text.                           | Medium     | --                             | Thin logging utility wrapping console with JSON output, levels (info/warn/error), and optional context (photoId, albumId). Not a logging framework -- just structured output. |
| D5  | **Health check endpoint**                     | No way to verify the app is running, database is accessible, and storage directory is writable. Needed for Docker HEALTHCHECK, deployment verification, and uptime monitoring.                                                      | Low        | --                             | `GET /api/health` returning `{ status: "ok", db: true, storage: true }`. Check DB with a simple query, storage with `fs.access`.                                              |
| D6  | **Stale processing data cleanup**             | Photos stuck in `"processing"` status indefinitely (Redis was down, worker crashed mid-job, server restarted) accumulate as phantom entries with no automated cleanup. Over time the admin dashboard fills with un-viewable photos. | Low        | T6                             | Script or admin endpoint to find photos in `"processing"` status older than N minutes and mark them `"error"` with a note.                                                    |
| D7  | **CI pipeline (lint + typecheck + test)**     | No CI configuration. Pre-commit hook runs lint-staged, but there is no automated quality gate for pushes or PRs. A failing test is only caught if the developer runs tests locally.                                                 | Medium     | T5                             | GitHub Actions workflow: `npm run lint`, `npm run typecheck`, `npm run test`. Blocks merge on failure.                                                                        |

### Anti-Features (Commonly Requested, Often Problematic During Hardening)

Things that sound useful but are wrong to prioritize during a quality/hardening milestone.

| #   | Feature                                         | Why Requested                                                                                       | Why Problematic                                                                                                                                                                                                                                                      | Alternative                                                                                                                                                                                                 |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **100% test coverage target**                   | "We should test everything" is a common reflex when going from zero to tested.                      | Chasing coverage percentage produces low-value tests: testing that React renders a div, testing Tailwind class strings, testing that Drizzle ORM calls the right SQL. Time is better spent on high-value logic tests.                                                | Target coverage on `infrastructure/services/`, `infrastructure/database/repositories/`, `infrastructure/config/`, `lib/imageLoader.ts`, and API route handlers. Leave `presentation/components/` for later. |
| A2  | **Full observability stack (Sentry, Datadog)**  | "We need error tracking in production."                                                             | This is a self-hosted, single-admin-user app. External SaaS monitoring adds complexity, recurring cost, and privacy concerns (photo metadata sent to third parties) disproportionate to the user base.                                                               | Structured logging (D4) + health check (D5) provides sufficient operational visibility for a single-user app. Add Sentry later only if logging proves insufficient.                                         |
| A3  | **Comprehensive Playwright E2E suite**          | "We should E2E test every page and every button."                                                   | E2E tests are slow (seconds per test), flaky (browser timing, network), and expensive to maintain (break on any UI change). For a single-admin portfolio, the critical interaction paths are narrow.                                                                 | 3-5 targeted smoke tests: login flow, upload a photo, create an album, view public gallery, view photo in lightbox. Not every admin interaction.                                                            |
| A4  | **Database migration framework**                | "We should add proper migration tooling for schema changes."                                        | The app uses SQLite with `drizzle-kit push`. Introducing a migration framework (drizzle-kit generate + migrate) changes the development workflow and deployment process. This is a tooling change, not a quality improvement.                                        | Fix the known FK constraint with a targeted `ALTER TABLE` script (D3). Defer migration framework adoption to a future milestone if schema changes become frequent.                                          |
| A5  | **Performance optimization before measurement** | "We should add caching, pagination, and lazy loading everywhere."                                   | Optimizing without profiling leads to premature optimization. The app serves one admin user and typically low-traffic public visitors. SQLite with hundreds of photos will not have query performance problems.                                                      | Measure first: check Core Web Vitals on public pages. The only known issue is homepage `force-dynamic` which could be addressed, but even that needs measurement to confirm it matters.                     |
| A6  | **Refactoring the empty application layer**     | "The application/ directory is empty. We should add service classes for proper Clean Architecture." | The application layer being empty is fine for this app's complexity level. Adding PhotoService, AlbumService, etc. that simply delegate to repositories creates indirection without providing value. The current repository + API route pattern is clean and direct. | Leave the architecture as-is. If business logic grows to need orchestration across multiple repositories, add services then. Do not add them pre-emptively.                                                 |
| A7  | **Rate limiting on all API routes**             | "Every endpoint should be rate limited for security."                                               | Rate limiting already exists on the login endpoint. All admin API routes require JWT authentication. Public routes serve cached/immutable images and read-only album data. The threat model does not justify rate limiting everything.                               | Keep login rate limiting. Optionally add rate limiting to the upload route only (it accepts large files and queues background jobs).                                                                        |

---

## Feature Dependencies

```
T3 (API validation) -------> T4 (API error handling) -------> T9 (error response format)
                                                          \
                                                           --> D1 (API integration tests)

T5 (unit tests) -----------> D7 (CI pipeline)

T6 (worker recovery) ------> D6 (stale data cleanup)

T7 (JSON parsing safety) --- standalone, no dependencies
T8 (file size limit) ------- standalone, no dependencies

T1 (error.tsx) ------------- standalone, no dependencies
T2 (not-found.tsx) --------- standalone, no dependencies
T10 (loading.tsx) ---------- standalone, no dependencies

D3 (FK constraint fix) ----- standalone, no dependencies
D4 (structured logging) ---- standalone, no dependencies
D5 (health check) ---------- standalone, no dependencies
```

---

## MVP Definition

### This Milestone (Quality & Hardening)

Priority order based on risk reduction and dependency chains:

**Phase 1: Safety Net** (highest risk reduction, all standalone)

1. T1 -- Error boundaries (`error.tsx` + `global-error.tsx`)
2. T2 -- Not-found pages (`not-found.tsx`)
3. T10 -- Loading states (`loading.tsx`)
4. T7 -- JSON parsing safety in repository mappers

**Phase 2: API Hardening** (dependency chain: T3 -> T4 -> T9) 5. T3 -- Input validation on all API routes 6. T4 -- Error handling wrappers 7. T9 -- Consistent error response format 8. T8 -- File size limit on uploads

**Phase 3: Testing Foundation** (T5 then D1) 9. T5 -- Unit tests for domain + infrastructure 10. D1 -- Integration tests for API routes

**Phase 4: Worker Resilience** (T6 then D6) 11. T6 -- Worker failure recovery (admin visibility + retry) 12. D6 -- Stale processing data cleanup

**Phase 5: Production Polish** (standalone items) 13. D3 -- Database FK constraint fix 14. D5 -- Health check endpoint 15. D4 -- Structured logging 16. D7 -- CI pipeline

### Defer (v2+)

- D2 -- Playwright E2E tests (high setup cost, lower ROI until functional coverage exists)
- Any items from the Anti-Features list

---

## Feature Prioritization Matrix

| #   | Feature               | User Value         | Risk Reduction                                              | Implementation Cost | Priority |
| --- | --------------------- | ------------------ | ----------------------------------------------------------- | ------------------- | -------- |
| T1  | Error boundaries      | High               | **Critical** -- prevents white screen on any uncaught error | Low (~2h)           | **P0**   |
| T7  | JSON parsing safety   | Medium             | **Critical** -- prevents page crash from corrupt data       | Low (~30min)        | **P0**   |
| T2  | Not-found pages       | Medium             | Medium -- cosmetic but expected in production               | Low (~1h)           | **P0**   |
| T10 | Loading states        | Medium             | Medium -- prevents blank flash on navigation                | Low (~1h)           | **P0**   |
| T3  | API input validation  | Medium             | **High** -- prevents crashes from malformed requests        | Low (~2h)           | **P1**   |
| T4  | API error handling    | Medium             | **High** -- prevents 500 errors from reaching users         | Low (~2h)           | **P1**   |
| T8  | File size limit       | Low                | **High** -- prevents OOM crash on large upload              | Low (~30min)        | **P1**   |
| T9  | Error response format | Low                | Medium -- developer experience, client reliability          | Low (~1h)           | **P1**   |
| T5  | Unit tests            | High (long-term)   | **High** -- regression detection for core logic             | Medium (~8h)        | **P1**   |
| D1  | API integration tests | High (long-term)   | **High** -- contract verification for all endpoints         | Medium (~6h)        | **P2**   |
| T6  | Worker recovery       | Medium             | Medium -- recovers stuck photos                             | Medium (~4h)        | **P2**   |
| D3  | FK constraint fix     | Low                | Medium -- prevents data integrity bugs                      | Low (~1h)           | **P2**   |
| D5  | Health check          | Low                | Low -- operational visibility for deployment                | Low (~1h)           | **P2**   |
| D6  | Stale data cleanup    | Low                | Low -- maintenance utility                                  | Low (~2h)           | **P2**   |
| D4  | Structured logging    | Low                | Low -- debugging improvement                                | Medium (~4h)        | **P3**   |
| D7  | CI pipeline           | Medium (long-term) | Medium -- automated quality gate                            | Medium (~3h)        | **P3**   |

---

## Detailed Audit Findings

### API Routes Audit

| Route                                  | Auth        | Validation          | Error Handling                | Issues Found                                                                                               |
| -------------------------------------- | ----------- | ------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `POST /api/admin/upload`               | Yes         | Partial (type only) | Partial (Redis timeout catch) | No file size limit. Silent Redis failure leaves photo in `"processing"` forever with no user notification. |
| `PATCH /api/admin/photos/[id]`         | Yes         | **None**            | Minimal                       | `body as { description: string                                                                             | null }`is a type assertion, not validation. No try/catch on`request.json()`. |
| `DELETE /api/admin/photos/[id]`        | Yes         | N/A                 | Minimal                       | `deletePhotoFiles()` errors propagate as 500. Should be resilient to partial file deletion.                |
| `POST /api/admin/photos/[id]/albums`   | Yes         | ?                   | ?                             | Not fully audited but follows similar patterns.                                                            |
| `DELETE /api/admin/photos/[id]/albums` | Yes         | ?                   | ?                             | Same as above.                                                                                             |
| `GET /api/admin/albums`                | Yes         | N/A                 | **None**                      | Database errors propagate as unstructured 500.                                                             |
| `POST /api/admin/albums`               | Yes         | Zod                 | Yes (safeParse)               | Good pattern. No try/catch on `request.json()` though.                                                     |
| `PATCH /api/admin/albums/[id]`         | Yes         | Zod                 | Yes (safeParse)               | Good pattern. `request.json()` lacks try/catch for truly malformed bodies.                                 |
| `DELETE /api/admin/albums/[id]`        | Yes         | Partial             | Good (`json().catch()`)       | Good defensive pattern on body parse.                                                                      |
| `POST /api/admin/albums/reorder`       | Yes         | Zod                 | Yes (safeParse)               | Good pattern.                                                                                              |
| `POST .../photos/reorder`              | Yes         | Zod                 | Yes (safeParse)               | Good pattern.                                                                                              |
| `GET /api/images/[photoId]/[filename]` | No (public) | Yes (filename)      | Yes (fallback)                | Good: validates filename, handles missing files, falls back to largest derivative.                         |

### Client Component Error Handling Audit

| Component          | Has Error State | Rollback on Failure     | Issues                                                                                                                                               |
| ------------------ | --------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| AlbumDetailClient  | Yes             | Yes (optimistic revert) | Error auto-dismisses after 3s. `setError` with `setTimeout` cleanup.                                                                                 |
| AlbumsPageClient   | Yes             | Yes (optimistic revert) | Same auto-dismiss. `handlePublishToggle` throws but the caller (`SortableAlbumCard`) may not catch.                                                  |
| AlbumSelector      | Yes             | Yes (optimistic revert) | Same auto-dismiss pattern.                                                                                                                           |
| PhotoDetail        | **Partial**     | **No**                  | Uses browser `alert()` for delete failure and `confirm()` for delete confirmation. Not accessible, not styled, not consistent with other components. |
| DeleteAlbumModal   | Yes             | N/A (modal stays open)  | Good pattern: shows error in modal, keeps modal open for retry.                                                                                      |
| UploadPage         | Yes             | N/A                     | Good pattern: per-file error state, retry button per file.                                                                                           |
| HomepageClient     | No error states | N/A                     | Client component but read-only; no mutations that could fail.                                                                                        |
| AlbumGalleryClient | No error states | N/A                     | Similar: read-only rendering of server-provided data.                                                                                                |

### Missing Next.js Convention Files

| File               | Needed At                                       | Impact of Absence                                            |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------ |
| `error.tsx`        | `app/`, `app/albums/`, `app/admin/(protected)/` | Unhandled errors show framework default page or white screen |
| `global-error.tsx` | `app/`                                          | Root layout errors are completely unrecoverable              |
| `not-found.tsx`    | `app/`                                          | Generic 404 with no site styling or navigation               |
| `loading.tsx`      | `app/`, `app/admin/(protected)/`, `app/albums/` | No loading indicator during server component data fetching   |

### Worker Failure Scenarios

| Scenario                             | Current Behavior                                                                      | User Impact                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Redis unavailable during upload      | Upload succeeds, job enqueue silently fails, photo stays in `"processing"` forever    | Admin sees "Processing..." forever, no way to fix it            |
| Sharp crashes on corrupt image       | Worker `failed` handler sets status to `"error"`                                      | Admin sees "error" badge but cannot retry or see reason         |
| Worker process crashes mid-job       | Photo stays in `"processing"` (no cleanup)                                            | Same as Redis unavailable                                       |
| Worker completes but DB update fails | Worker logs error, photo stays in `"processing"` despite derivatives existing on disk | Admin sees stale status, derivatives exist but are unreferenced |

---

## Sources

- Direct codebase audit of all source files under `/Users/arxherre/Documents/photo-profile/src/`
- `package.json` dependencies: Next.js 16.1.6, Vitest 4.0.18, Playwright 1.58.2, Zod 4.3.6
- Next.js App Router conventions for `error.tsx`, `loading.tsx`, `not-found.tsx`, `global-error.tsx` (training data, HIGH confidence -- stable conventions since Next.js 13, unchanged through 16)
- Vitest configuration and testing patterns (training data, HIGH confidence)
- BullMQ worker event handling patterns (training data, HIGH confidence)
- Zod validation patterns for API routes (training data, confirmed by existing usage in this codebase)

**Note:** WebSearch was unavailable during this research session. All findings are based on direct codebase file reads and training data. Codebase-specific findings (audit tables, file gap inventory) are HIGH confidence since they come from reading every relevant file. Pattern recommendations (error boundaries, testing strategy, API hardening) are HIGH confidence as they are well-established conventions in the Next.js and Node.js ecosystems.

---

_Feature research for: Photography portfolio quality & hardening_
_Researched: 2026-02-06_
