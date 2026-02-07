# Project Research Summary

**Project:** Photo Portfolio v1.2 Quality & Hardening
**Domain:** Testing, error handling, performance optimization for existing Next.js photography portfolio
**Researched:** 2026-02-06
**Confidence:** HIGH

## Executive Summary

This milestone adds production-readiness to an existing ~6,043 LOC photography portfolio built with Next.js 16, TypeScript, SQLite/Drizzle, Sharp, and BullMQ. The codebase follows Clean Architecture (domain/application/infrastructure/presentation layers), which was designed for testability. The core architectural insight: **the application layer is empty** — business logic lives directly in API route handlers. This means unit tests must either test routes directly OR extract services first. The research recommends testing at the API route integration level and only extracting services when duplication becomes painful.

The recommended approach is wave-based execution starting with testing infrastructure, followed by error handling, unit/integration testing, worker resilience, and production polish. The critical blocker is module-level initialization of infrastructure (database, Redis, env validation) that fires at import time, making test isolation impossible without comprehensive mocking. The vitest setup must establish global mocks for Next.js server APIs (server-only, cookies, headers), IORedis connections, and environment variables BEFORE any infrastructure code can be tested. This is Phase 1, blocking all other work.

Key risks: (1) module-scope database imports prevent test injection unless repositories are refactored to constructor injection, (2) JSON.parse in repository toDomain() crashes on corrupt EXIF data with no try/catch (latent production bug affecting every page), (3) silent Redis failure in upload route leaves photos stuck in "processing" forever with zero logging, (4) worker event handlers update DB after BullMQ marks job complete, so failures are not retried. These are all fixable with targeted changes, but attempting quality work without addressing the testing infrastructure blockers first will waste effort on fragile mock-dependent tests.

## Key Findings

### Recommended Stack

The project already has Vitest 4.0.18 and Playwright 1.58.2 installed but zero tests written. The quality gap is not missing tools but missing implementation. Only two dev dependencies are needed: @vitest/coverage-v8 (must match vitest major version 4.x for V8 native coverage, faster than Istanbul) and @next/bundle-analyzer@16.1.6 (must match Next.js 16.1.6 for bundle composition analysis). Everything else required is implementation, not dependencies.

**Core technologies:**

- @vitest/coverage-v8@^4.0.18: Code coverage reporting — V8 native coverage requires no source instrumentation, faster than Istanbul for CI
- @next/bundle-analyzer@16.1.6: Bundle analysis — official Vercel package matching installed Next.js version
- In-memory SQLite (better-sqlite3 :memory:): Repository testing — real SQL execution without mocking Drizzle ORM
- Zod (already installed): API validation — already used in env.ts, same pattern applies to route validation
- No runtime libraries needed: Error handling uses Next.js built-in error.tsx/not-found.tsx/global-error.tsx boundaries

**Testing strategy by layer:**

- domain/entities: Skip (interfaces only, no logic)
- infrastructure/repositories: Integration tests with real in-memory SQLite (fast, accurate)
- infrastructure/services (imageService, exifService): Unit tests with tiny fixture images or Sharp mocks
- infrastructure/auth: Unit tests with mocked Redis for rate limiter, real jose/bcrypt
- infrastructure/storage: Unit tests with temp directories (os.tmpdir())
- app/api routes: Integration tests calling handlers directly with mock auth/repos
- presentation/components: Deferred (out of scope for this milestone)

### Expected Features

From comprehensive codebase audit: zero error.tsx files, zero not-found.tsx files, zero loading.tsx files. API routes have inconsistent validation (5 use Zod, 3 use raw type assertions). Worker has error handlers but no retry-with-status-recovery pattern. Single test file exists (theme-tokens.test.ts). The upload route silently swallows Redis errors in an empty catch block with no user notification, leaving photos stuck in "processing" forever.

**Must have (table stakes):**

- T1: Error boundaries (error.tsx + global-error.tsx) — prevents white screen crashes
- T2: Not-found pages (not-found.tsx) — proper 404s instead of framework default
- T3: API input validation — standardize on Zod for all routes
- T4: API error handling wrappers — consistent try/catch patterns
- T5: Unit tests for domain + infrastructure — repositories, image service, auth, storage
- T6: Worker failure recovery — admin UI for stuck/error photos with retry
- T7: JSON parsing safety — wrap JSON.parse in repository toDomain() (P0 latent crash bug)
- T8: File size limit on uploads — prevent OOM with 2GB upload
- T9: Consistent error response format — standardize { error: string } shape
- T10: Loading states (loading.tsx) — prevent blank flash during navigation

**Should have (competitive):**

- D1: Integration tests for API routes — verify full request-to-response cycle
- D2: E2E smoke tests with Playwright (3-5 tests) — login, upload, album creation, gallery viewing
- D3: Database FK constraint fix (coverPhotoId SET NULL) — already has migration, verify it ran
- D4: Structured logging — replace console.log with leveled JSON output
- D5: Health check endpoint — GET /api/health for Docker HEALTHCHECK
- D6: Stale processing data cleanup — find photos in "processing" >N minutes, mark error
- D7: CI pipeline (lint + typecheck + test) — automated quality gate

**Defer (v2+):**

- Comprehensive Playwright suite (E2E tests are slow/flaky, target critical paths only)
- 100% test coverage target (focus on infrastructure layer, exclude trivial code)
- Database migration framework (fix FK constraint with targeted ALTER TABLE, defer migration tooling)
- Full observability stack (single-admin app needs logging, not Sentry/Datadog)

### Architecture Approach

The existing Clean Architecture with four layers (domain, application, infrastructure, presentation) plus Next.js App Router is ideal for quality hardening because the domain and application layers have no external dependencies (designed for testability). The infrastructure layer uses repository pattern with interfaces, enabling mock-based testing. The critical finding: application/services/ is empty (.gitkeep files only), so business logic is in route handlers and worker event handlers. This is acceptable at current complexity — add services only when duplication emerges, not preemptively.

**Test file structure (colocated):**

```
src/
  infrastructure/
    database/repositories/__tests__/SQLitePhotoRepository.integration.test.ts
    services/__tests__/imageService.test.ts
    auth/__tests__/session.test.ts
  app/api/__tests__/upload.integration.test.ts
tests/
  e2e/public-gallery.spec.ts (Playwright)
  fixtures/test-image.jpg
```

**Major architectural decisions for quality:**

1. Error boundary tree: Root app/error.tsx (catch-all), albums/[id]/error.tsx (specific: "Failed to load album"), admin/(protected)/error.tsx (authenticated errors). 3-5 error.tsx files max, aligned with route groups, not every file.
2. API error handling: Lightweight wrapper for try/catch + error logging, keep auth checks explicit for clarity (not hidden in wrapper).
3. Repository testing: Refactor repositories to accept DB instance via constructor injection, enabling test DB injection. Alternative: accept module-level mocking with vi.mock() as the testing seam.
4. Worker resilience: Move DB update INTO processor function (not event handler) so BullMQ retries cover it, OR add stuck-processing detection job.
5. Performance: Measure FIRST (Lighthouse, EXPLAIN QUERY PLAN, memory usage), optimize bottlenecks only. Baseline for ~100-500 photos, not premature optimization.

### Critical Pitfalls

From deep codebase analysis, five critical pitfalls that block progress or cause data corruption:

1. **Module-scope database import blocks test injection** — repositories import `db` from `../client` at module top, which calls initializeDatabase() on import. Tests hit real database, cannot inject in-memory test DB. FIX: Refactor to constructor injection OR use vi.mock("@/infrastructure/database/client") as the testing seam.

2. **JSON.parse in repository toDomain() crashes on corrupt data** — SQLitePhotoRepository.toDomain() does JSON.parse(row.exifData) with no try/catch (line 125). Corrupt EXIF JSON crashes every page loading photos (homepage, albums, admin). This is on the critical path for all pages. FIX: Wrap in try/catch returning null on failure. **This is a P0 production bug, fix immediately.**

3. **Schema drift between Drizzle schema and actual DB** — albums.tags exists in schema.ts but not in CREATE TABLE (only added if FK migration fired). photos.exif_data/width/height added via ALTER TABLE. Test databases created from CREATE TABLE only will differ from production. FIX: Test helper must run full initializeDatabase() migration chain.

4. **Redis module-level connections hang tests** — queues.ts, imageProcessor.ts, rateLimiter.ts all create IORedis at import time. Any test importing these hangs waiting for Redis. FIX: Mock ioredis globally in vitest setup, OR mock @/infrastructure/jobs and @/infrastructure/auth/rateLimiter at module level.

5. **server-only modules crash Vitest** — session.ts and dal.ts import "server-only", which throws at runtime in plain Node.js. Also use cookies()/headers() from next/headers requiring Next.js async context. FIX: Mock server-only, next/headers, next/navigation, next/cache in vitest setup file BEFORE any infrastructure imports.

## Implications for Roadmap

Based on combined research, this milestone naturally splits into 5 phases with clear dependency chains. Phase 1 is the critical blocker — all other work depends on test infrastructure being operational.

### Phase 1: Testing Infrastructure + Schema Audit

**Rationale:** Blocks all other testing work. Addresses pitfalls 1-5 (module imports, Redis hangs, server-only crashes, schema drift). Must be FIRST.
**Delivers:** Vitest setup with global mocks (server-only, next/headers, next/navigation, next/cache, ioredis), env var setup for tests, test database helper (temp SQLite with full migrations), schema validation tests, Sharp mock for unit tests, test fixture images, testing conventions doc, production DB schema audit.
**Addresses:** Technical foundation enabling T5, D1, D2
**Avoids:** Pitfall 1 (DB import), Pitfall 2 (server-only), Pitfall 3 (schema drift), Pitfall 4 (Redis hangs), Pitfall 5 (JSON.parse — fix as part of this phase)
**Research needed:** No — standard Vitest patterns, well-documented. Skip /gsd:research-phase.

### Phase 2: Error Boundaries + API Hardening

**Rationale:** Highest risk reduction per effort. All standalone features (no complex dependencies), prevents crashes. Dependency chain: T3 (validation) → T4 (error handling) → T9 (response format).
**Delivers:** error.tsx files (root, admin, albums), not-found.tsx, loading.tsx, JSON parsing safety fix (P0 bug), API validation with Zod on all routes, consistent error handling wrappers, standard error response format, file size limit on uploads.
**Addresses:** T1, T2, T3, T4, T7, T8, T9, T10
**Avoids:** Pitfall 5 (JSON.parse — critical fix), Pitfall 6 (error swallowing — audit existing catch blocks)
**Research needed:** No — Next.js App Router error.tsx conventions are stable. Skip /gsd:research-phase.

### Phase 3: Unit + Integration Testing

**Rationale:** Depends on Phase 1 infrastructure. Highest-value test targets: repositories (SQL correctness, serialization), image service (Sharp pipeline), auth (JWT lifecycle), API routes (validation + error handling from Phase 2).
**Delivers:** ~15-20 test files covering infrastructure/database/repositories (integration with in-memory SQLite), infrastructure/services (unit with fixtures/mocks), infrastructure/auth (unit with mocked Redis), infrastructure/storage (integration with temp dirs), app/api routes (integration with mocked auth), @vitest/coverage-v8 reporting.
**Addresses:** T5, D1
**Avoids:** Pitfall 7 (mock divergence — use real SQLite), Pitfall 8 (testing Server Components — document policy), Pitfall 10 (toDomain/toDatabase — round-trip tests)
**Research needed:** No — testing patterns are well-established. Skip /gsd:research-phase.

### Phase 4: Worker Resilience + Tech Debt

**Rationale:** Depends on testing infrastructure (can write tests for worker behavior). Addresses photos stuck in "processing" from silent Redis failures and event handler errors.
**Delivers:** Worker DB update moved to processor function (or retry logic in handler), admin UI filtering for stuck/error photos, retry action for failed photos, stale processing data cleanup (cron/endpoint), FK constraint verification (run PRAGMA foreign_key_list), orphaned file cleanup utility.
**Addresses:** T6, D3, D6
**Avoids:** Pitfall 13 (worker event handler no-retry), Pitfall 12 (FK constraint — verify existing migration)
**Research needed:** Minimal — BullMQ event handler vs processor distinction needs verification. Consider /gsd:research-phase if retry patterns are unclear.

### Phase 5: Performance + Production Polish

**Rationale:** Independent of other phases, can run in parallel with Phase 3/4. Must measure FIRST before optimizing.
**Delivers:** Performance baselines (Lighthouse on public pages, API timing, worker throughput, EXPLAIN QUERY PLAN), bundle analysis with @next/bundle-analyzer (establish baseline), targeted optimizations (only if measurements justify: WAL mode for SQLite, ETag/304 for image serving, image parallelization with memory monitoring), health check endpoint (GET /api/health), structured logging utility, CI pipeline (lint + typecheck + test in GitHub Actions).
**Addresses:** D4, D5, D7, performance optimization (measured)
**Avoids:** Pitfall 11 (performance without baselines — measure first), Pitfall 9 (Sharp parallel memory pressure — monitor)
**Research needed:** No — standard patterns. Skip /gsd:research-phase.

### Phase 6 (Optional/Stretch): E2E Smoke Tests

**Rationale:** Highest setup cost, lower ROI until unit/integration tests exist. 3-5 targeted tests for critical paths only.
**Delivers:** Playwright config, test seed script (deterministic DB + storage), isolated test database/storage, 3-5 E2E tests (login flow, upload + processing + gallery display, album creation + publish, public gallery browsing, photo lightbox).
**Addresses:** D2
**Avoids:** Pitfall 12 (E2E data dependencies — seed script with known fixtures)
**Research needed:** Minimal — Playwright is installed but unconfigured. Standard setup. Skip /gsd:research-phase.

### Phase Ordering Rationale

- **Phase 1 must be first:** All testing depends on infrastructure. Module-level imports crash without mocks.
- **Phase 2 early for safety:** Error boundaries and API hardening have highest risk reduction (prevent crashes) with low complexity (standalone features, no test dependencies).
- **Phase 3 depends on Phase 1:** Cannot write repository tests without test DB helper and mocks.
- **Phase 4 can overlap Phase 3:** Worker resilience is independent of API/repository testing.
- **Phase 5 independent:** Performance baselining and CI setup can run anytime, but measure-first approach means it should not block other work.
- **Phase 6 deferred:** E2E tests have high setup cost and are fragile. Build functional coverage (unit + integration) first, add E2E as validation smoke tests.

**Dependency chains identified:**

- T3 (API validation) → T4 (error handling) → T9 (error format) → D1 (API integration tests)
- Phase 1 (test infra) → T5 (unit tests) → D7 (CI pipeline)
- T6 (worker recovery) → D6 (stale cleanup)
- Phase 1 → Phase 3 (tests) → Phase 6 (E2E)

### Research Flags

**Skip /gsd:research-phase for all phases:** All patterns are well-established (Next.js error boundaries, Vitest with Next.js, BullMQ worker patterns, performance baselining). The codebase audit provides project-specific details. No novel integrations or niche domains.

**Phases with standard patterns:**

- **Phase 1:** Vitest + Next.js mocking is documented extensively (next/headers, server-only, better-sqlite3 :memory:)
- **Phase 2:** Next.js App Router error.tsx/not-found.tsx/loading.tsx are framework conventions since Next.js 13
- **Phase 3:** Repository testing with in-memory SQLite, API route testing by invoking handlers directly — both standard patterns
- **Phase 4:** BullMQ retry strategies and event handler vs processor distinctions are in BullMQ docs
- **Phase 5:** Lighthouse, @next/bundle-analyzer, EXPLAIN QUERY PLAN, performance budgets — all standard tooling
- **Phase 6:** Playwright E2E testing with seed data — standard pattern

**Potential research during execution:**

- If Phase 4 worker retry patterns prove complex during implementation, targeted BullMQ research may be needed (but not upfront)
- If Phase 5 performance measurements reveal unexpected bottlenecks (e.g., Sharp processing slower than expected), investigate Sharp optimization patterns

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | Vitest/Playwright already installed (versions verified from package.json), @vitest/coverage-v8 and @next/bundle-analyzer versions verified in npm registry. In-memory SQLite is standard better-sqlite3 feature.                                                                                                                                                                              |
| Features     | HIGH       | All findings from direct codebase audit (read all API routes, repositories, worker, components). Missing error.txt files verified by directory scan. Zero test gap confirmed.                                                                                                                                                                                                                 |
| Architecture | HIGH       | Existing Clean Architecture verified from source (domain/application/infrastructure/presentation directories). Test organization follows established colocated **tests**/ pattern. Error boundary placement follows Next.js route hierarchy.                                                                                                                                                  |
| Pitfalls     | HIGH       | All critical pitfalls verified by reading actual source code: module-level imports (client.ts line 140, repository imports line 1), JSON.parse (SQLitePhotoRepository line 125), Redis connections (queues.ts line 31), server-only imports (session.ts, dal.ts), schema drift (client.ts CREATE TABLE vs schema.ts). Worker event handler issue confirmed (imageProcessor.ts lines 105-132). |

**Overall confidence:** HIGH

All research based on direct codebase analysis (255 files, 6,043 LOC examined) plus installed package versions. WebSearch was unavailable but not needed — Next.js/Vitest/Playwright patterns are well within training data. Project-specific findings (file gaps, latent bugs, module imports) are HIGH confidence from source code inspection.

### Gaps to Address

Minor gaps requiring validation during implementation:

- **BullMQ event handler vs processor retry semantics:** The research identifies that event handlers run after job completion (no retry), but the exact API for moving DB updates into the processor function should be verified against BullMQ docs during Phase 4. Mitigation: Start with stuck-processing detection as a pragmatic workaround if processor refactor proves complex.

- **Sharp memory usage with parallelization:** The worker comment says "50MP images use ~144MB each" and concurrency is 2. If parallelizing WebP+AVIF generation for the same width, peak memory doubles (288MB per image). Measure memory before/after parallelization in Phase 5. Mitigation: Only parallelize if measurements show it helps, and reduce concurrency from 2 to 1 to compensate.

- **Playwright auth flow with JWT cookies:** Testing protected routes in Playwright requires setting up session cookies. The auth flow uses jose for JWT encryption. Verify cookie-setting patterns for Playwright in Phase 6 setup. Mitigation: Standard Playwright cookie API, well-documented.

- **FK constraint migration actual state:** The migration in client.ts (lines 96-128) attempts to fix coverPhotoId SET NULL, but only runs if PRAGMA detects the wrong state. Verify on the actual production database with `PRAGMA foreign_key_list(albums)` during Phase 4. Mitigation: Run PRAGMA check, apply explicit ALTER TABLE if needed.

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis: All files under /Users/arxherre/Documents/photo-profile/src/ examined
- package.json: vitest 4.0.18, @playwright/test 1.58.2, next 16.1.6, zod 4.3.6, better-sqlite3 12.6.2 (installed versions)
- npm registry: @vitest/coverage-v8@4.0.18 verified, @next/bundle-analyzer@16.1.6 verified
- infrastructure/database/client.ts: Lines 1-141 (module-level init, migrations, CREATE TABLE statements)
- infrastructure/database/schema.ts: Drizzle schema (desired state)
- infrastructure/database/repositories/SQLitePhotoRepository.ts: Line 1 (db import), line 125 (JSON.parse vulnerability)
- infrastructure/database/repositories/SQLiteAlbumRepository.ts: Line 1 (db import)
- infrastructure/jobs/queues.ts: Line 31 (IORedis module-level connection)
- infrastructure/jobs/workers/imageProcessor.ts: Lines 19, 105-132 (Redis connection, event handler DB update)
- infrastructure/auth/session.ts, dal.ts: server-only imports, cookies() usage
- infrastructure/auth/rateLimiter.ts: Line 10 (IORedis module-level connection)
- app/api/admin/upload/route.ts: Lines 81-84 (silent Redis error catch)
- vitest.config.ts: Existing configuration with path aliases, globals: true

### Secondary (MEDIUM confidence)

- Next.js App Router error.tsx conventions (training data, MEDIUM-HIGH confidence — stable since Next.js 13, unchanged through 16)
- Vitest with Next.js mocking patterns (training data, well-established community patterns)
- BullMQ worker event handling (training data, confirmed by existing code structure)
- better-sqlite3 :memory: databases (training data, standard SQLite feature)
- Sharp native binary considerations (training data, common CI issue with C++ addons)

### Tertiary (LOW confidence)

- None — WebSearch was unavailable but not required. All critical findings from direct source inspection.

---

_Research completed: 2026-02-06_
_Ready for roadmap: yes_
