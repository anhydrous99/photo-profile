# Roadmap: Photo Portfolio

## Milestones

- v1.0 MVP - Phases 1-10 (shipped 2026-02-05)
- v1.1 Enhancement - Phases 11-14 (shipped 2026-02-06)
- v1.2 Quality & Hardening - Phases 15-19 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-10) - SHIPPED 2026-02-05</summary>

29 plans across 10 phases. All complete. See git history for details.

</details>

<details>
<summary>v1.1 Enhancement (Phases 11-14) - SHIPPED 2026-02-06</summary>

11 plans across 4 phases. All complete. See .planning/milestones/v1.1-ROADMAP.md for details.

</details>

### v1.2 Quality & Hardening (In Progress)

**Milestone Goal:** Make the portfolio solid, tested, and resilient -- unit tests for core logic, error handling across all surfaces, worker recovery, performance optimization, and tech debt cleanup.

#### Phase 15: Testing Infrastructure

**Goal**: Developers can write and run tests against the full infrastructure layer without module-level crashes, Redis hangs, or schema drift
**Depends on**: Nothing (first phase of milestone)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Plans:** 2 plans
**Success Criteria** (what must be TRUE):

1. Running `npx vitest run` completes without hanging or crashing on module-level imports (server-only, next/headers, IORedis all mocked)
2. A test file can import any repository and execute queries against an in-memory SQLite database whose schema matches production (including ALTER TABLE migrations)
3. A test file can import image processing code and use fixture images for Sharp/EXIF assertions without needing real large photos
4. Running `npx vitest run --coverage` produces a V8 coverage report for the infrastructure layer
5. At least one smoke test per mock category (Next.js APIs, Redis, database) passes to prove the setup works

Plans:

- [x] 15-01-PLAN.md -- Vitest setup mocks and test database helper
- [x] 15-02-PLAN.md -- Test fixtures, coverage config, and smoke tests

#### Phase 16: Error Boundaries & API Hardening

**Goal**: Users never see a white screen crash, a raw framework 404, or an inconsistent API error -- every failure surface has a designed recovery path
**Depends on**: Nothing (standalone, no test dependency)
**Requirements**: ERR-01, ERR-02, ERR-03, ERR-04, ERR-05, ERR-06, ERR-07, ERR-08, ERR-09, ERR-10, ERR-11
**Plans:** 3 plans
**Success Criteria** (what must be TRUE):

1. When any public page throws an unhandled error, a styled error page appears with a retry button instead of a white screen
2. When a user navigates to a nonexistent URL, a styled 404 page appears with navigation back to the gallery
3. When navigating between route segments, a loading indicator appears instead of a blank flash
4. Every API route validates input with Zod and returns a consistent `{ error: string }` JSON response on failure (no raw stack traces, no inconsistent shapes)
5. Uploading a file that exceeds the size limit is rejected before reading into memory, and Redis/queue failures during upload are logged instead of silently swallowed

Plans:

- [x] 16-01-PLAN.md -- Error boundaries and loading states (error.tsx, global-error.tsx, not-found.tsx, loading.tsx)
- [x] 16-02-PLAN.md -- API hardening (Zod validation, try/catch wrappers, consistent responses, upload safeguards)
- [x] 16-03-PLAN.md -- Data layer safety and upload UX (JSON.parse try/catch, DropZone 25MB limit, rejection toasts)

#### Phase 17: Unit & Integration Testing

**Goal**: Core infrastructure has automated test coverage proving repositories, image processing, auth, and API routes work correctly
**Depends on**: Phase 15 (test infrastructure required), Phase 16 (error handling patterns to test against)
**Requirements**: UNIT-01, UNIT-02, UNIT-03, UNIT-04, UNIT-05
**Success Criteria** (what must be TRUE):

1. Repository tests create, read, update, and delete photos and albums in an in-memory SQLite database and all assertions pass
2. Repository tests verify toDomain/toDatabase round-trip serialization handles edge cases (null EXIF, Unicode filenames, zero dimensions) without data loss or crashes
3. Image service tests verify derivative generation produces expected output formats and sizes using fixture images
4. Auth tests verify JWT session creation returns a valid token, verification accepts valid tokens and rejects expired/tampered ones
5. API route tests verify that invalid input returns 400, unauthenticated requests return 401/404, and valid requests return expected data
   **Plans:** 3 plans

Plans:

- [x] 17-01-PLAN.md -- Photo & album repository integration tests (CRUD, junction ops, serialization edge cases)
- [x] 17-02-PLAN.md -- Image service, EXIF service, and auth unit tests (derivatives, blur, JWT, bcrypt)
- [x] 17-03-PLAN.md -- Admin API route integration tests (auth checks, Zod validation, CRUD responses)

#### Phase 18: Worker Resilience & Tech Debt

**Goal**: Photos never get permanently stuck in "processing" status, and known schema/code debt is resolved
**Depends on**: Phase 15 (test infrastructure for worker tests)
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04, DEBT-01, DEBT-02, DEBT-03
**Success Criteria** (what must be TRUE):

1. Admin can filter the photo list to see only photos in "processing" or "error" status
2. Admin can trigger reprocessing of a failed photo from the admin panel, and the photo re-enters the processing pipeline
3. Photos stuck in "processing" status beyond a configurable time threshold are automatically detected and flagged
4. Worker DB status updates are resilient to failures (either inside the processor function for BullMQ retry coverage, or with explicit retry logic)
5. The albums.coverPhotoId foreign key has ON DELETE SET NULL behavior, the Drizzle schema matches the actual database, and stale/misleading code comments are fixed
   **Plans:** 3 plans

Plans:

- [x] 18-01-PLAN.md -- Worker resilience (in-processor DB updates, findByStatus/findStaleProcessing repo methods, findOriginalFile helper)
- [x] 18-02-PLAN.md -- Admin UI for stuck/failed photos (status filter dropdown, stale detection, reprocess API endpoint)
- [x] 18-03-PLAN.md -- Tech debt cleanup (FK constraint SET NULL in initial CREATE, schema drift fix, stale comment correction)

#### Phase 19: Performance & Production

**Goal**: Performance is measured with baselines, targeted optimizations are applied where data justifies them, and production observability is in place
**Depends on**: Nothing (independent, but benefits from all prior phases being stable)
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, PERF-05
**Success Criteria** (what must be TRUE):

1. Lighthouse scores and API response times are measured and recorded as baselines for public pages before any optimization
2. Bundle analysis is configured and a baseline bundle composition is recorded, identifying the largest chunks
3. GET /api/health returns 200 when the database and storage are accessible, and a non-200 status when either is unavailable
4. Application logging uses a structured utility with log levels and JSON output instead of raw console.log calls
5. At least one targeted optimization (informed by measurement data) is applied and its impact is measured against the baseline
   **Plans:** 3 plans

Plans:

- [ ] 19-01-PLAN.md -- Bundle analysis configuration and Lighthouse baseline measurement infrastructure
- [ ] 19-02-PLAN.md -- Health check endpoint, structured logging utility, and console.\* migration
- [ ] 19-03-PLAN.md -- Targeted optimizations (SQLite WAL mode, image ETag/304) with documented justification

## Progress

**Execution Order:**
Phases 15 and 16 can execute in parallel (no dependency). Phase 17 depends on both 15 and 16. Phase 18 depends on 15. Phase 19 is independent.

| Phase                                | Milestone | Plans Complete | Status      | Completed  |
| ------------------------------------ | --------- | -------------- | ----------- | ---------- |
| 15. Testing Infrastructure           | v1.2      | 2/2            | Complete    | 2026-02-07 |
| 16. Error Boundaries & API Hardening | v1.2      | 3/3            | Complete    | 2026-02-07 |
| 17. Unit & Integration Testing       | v1.2      | 3/3            | Complete    | 2026-02-08 |
| 18. Worker Resilience & Tech Debt    | v1.2      | 3/3            | Complete    | 2026-02-08 |
| 19. Performance & Production         | v1.2      | 0/3            | Not started | -          |
