---
phase: 15-testing-infrastructure
plan: 02
subsystem: testing
tags: [vitest, coverage, fixtures, smoke-tests, sharp, sqlite]
dependency-graph:
  requires: [15-01]
  provides: [coverage-config, fixture-images, smoke-tests]
  affects: [17-unit-tests, 18-integration-tests]
tech-stack:
  added: ["@vitest/coverage-v8@4.0.18"]
  patterns: [fixture-generation, smoke-test-validation, v8-coverage]
key-files:
  created:
    - src/__tests__/fixtures/generate-fixtures.ts
    - src/__tests__/fixtures/tiny-landscape.jpg
    - src/__tests__/fixtures/tiny-portrait.jpg
    - src/__tests__/fixtures/tiny-no-exif.png
    - src/infrastructure/__tests__/mocks.smoke.test.ts
    - src/infrastructure/__tests__/test-db.smoke.test.ts
    - src/infrastructure/__tests__/fixtures.smoke.test.ts
  modified:
    - vitest.config.ts
    - src/__tests__/setup.ts
    - src/__tests__/helpers/test-db.ts
decisions: []
metrics:
  duration: 4 min
  completed: 2026-02-07
---

# Phase 15 Plan 02: Coverage, Fixtures, and Smoke Tests Summary

**One-liner:** V8 coverage for infrastructure layer, 3 tiny Sharp-generated fixture images, and 17 smoke tests validating mocks/DB/fixtures end-to-end.

## What Was Done

### Task 1: Install coverage provider, generate fixtures, add coverage config (9554a8c)

- Installed `@vitest/coverage-v8@4.0.18` matching the project's vitest version
- Created `generate-fixtures.ts` script that uses Sharp to produce 3 tiny test images:
  - `tiny-landscape.jpg` (8x6 JPEG, 545 bytes, with EXIF: Make=TestCamera, Model=TestModel X100)
  - `tiny-portrait.jpg` (6x8 JPEG, 505 bytes, with EXIF: Make=AnotherBrand, Model=Pro 50)
  - `tiny-no-exif.png` (8x8 PNG, 95 bytes, no EXIF data)
- Added V8 coverage config to `vitest.config.ts` targeting `src/infrastructure/**/*.ts`, excluding `worker.ts` and `load-env.ts`, with text/html/json reporters

### Task 2: Write smoke tests for all mock categories (bef39e5)

**mocks.smoke.test.ts** -- 7 tests validating global mocks:

1. `server-only` imports without crash
2. `next/headers` cookies() returns mock with `.get`
3. `next/cache` revalidatePath() callable without error
4. Auth session module importable with `encrypt`/`decrypt` defined
5. Auth DAL module importable with `verifySession` defined
6. ioredis constructable without TCP hang
7. Queues module importable with `imageQueue` defined

**test-db.smoke.test.ts** -- 6 tests validating in-memory database:

1. Photos schema has all 11 columns (including migration-added exif_data, width, height)
2. Albums schema has all 8 columns (including tags from Phase 13)
3. Albums cover_photo_id FK has ON DELETE SET NULL
4. Drizzle ORM insert/select works on photos
5. Junction table photo_albums insert with relationships
6. CASCADE DELETE on photo_albums when photo is deleted

**fixtures.smoke.test.ts** -- 4 tests validating fixture images:

1. tiny-landscape.jpg is valid JPEG (8x6) loadable by Sharp
2. tiny-landscape.jpg has EXIF Buffer data
3. tiny-portrait.jpg has portrait dimensions (6x8)
4. tiny-no-exif.png is valid PNG (8x8) without EXIF

## Task Commits

| Task | Name                                                              | Commit  | Key Files                                                           |
| ---- | ----------------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| 1    | Install coverage provider, generate fixtures, add coverage config | 9554a8c | vitest.config.ts, src/**tests**/fixtures/\*                         |
| 2    | Write smoke tests for all mock categories                         | bef39e5 | src/infrastructure/**tests**/\*.smoke.test.ts, setup.ts, test-db.ts |

## Decisions Made

None -- plan executed as written with bug fixes only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ioredis/bullmq mocks used arrow functions not constructable with `new`**

- **Found during:** Task 2
- **Issue:** `vi.fn(() => (...))` uses arrow functions which cannot be called as constructors. The ioredis and bullmq mocks failed when modules called `new IORedis()` or `new Queue()`.
- **Fix:** Changed to `vi.fn(function(this: Record<string, unknown>) { ... })` using regular functions that are constructable.
- **Files modified:** `src/__tests__/setup.ts`
- **Commit:** bef39e5

**2. [Rule 1 - Bug] test-db.ts stale FK reference after albums table rebuild**

- **Found during:** Task 2
- **Issue:** When `createTestDb()` renames `albums` to `_albums_old` with `foreign_keys = OFF`, SQLite does not update FK references in other tables. The `photo_albums` table's FK still pointed to `_albums_old(id)` instead of `albums(id)`, causing "no such table: main.\_albums_old" errors on any `photo_albums` insert via Drizzle.
- **Fix:** Added step 8 to `createTestDb()` that rebuilds `photo_albums` after the albums migration to fix the stale FK reference.
- **Files modified:** `src/__tests__/helpers/test-db.ts`
- **Commit:** bef39e5

## Verification Results

| Check                                        | Result                                |
| -------------------------------------------- | ------------------------------------- |
| `npx vitest run` all tests pass              | PASS (75 tests, 4 files, 428ms)       |
| `npx vitest run --coverage` generates report | PASS (V8 coverage for infrastructure) |
| Coverage includes src/infrastructure/ files  | PASS (all infra files reported)       |
| Fixture images < 5KB each                    | PASS (545B, 505B, 95B)                |
| No test hangs                                | PASS (suite completes < 500ms)        |

## Next Phase Readiness

- **17 (Unit Tests):** Ready. Smoke tests serve as usage examples for test authors. Fixtures available for Sharp-based tests. Coverage tracking active.
- **18 (Integration Tests):** Ready. All infrastructure mocks, DB helper, and fixtures proven working.

## Self-Check: PASSED
