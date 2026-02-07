---
phase: 15-testing-infrastructure
plan: 01
subsystem: testing
tags: [vitest, mocks, test-infrastructure, sqlite, in-memory-db]
dependency-graph:
  requires: []
  provides: [vitest-config, global-mocks, test-db-helper]
  affects: [15-02, 17-unit-tests, 18-integration-tests]
tech-stack:
  added: []
  patterns: [global-setup-mocks, in-memory-test-database, migration-replay]
key-files:
  created:
    - src/__tests__/setup.ts
    - src/__tests__/helpers/test-db.ts
  modified:
    - vitest.config.ts
decisions:
  - id: D-15-01-01
    summary: "Env vars set in vitest.config.ts test.env (not .env.test file)"
    rationale: "Vitest injects test.env before any module loads, preventing env.ts Zod validation crash without needing dotenv"
  - id: D-15-01-02
    summary: "Setup file uses only vi.mock() calls, no direct imports of mocked modules"
    rationale: "Vitest known issue: mocks fail if setup file imports the mocked module itself"
  - id: D-15-01-03
    summary: "test-db.ts replays exact migration chain from client.ts rather than using schema-based creation"
    rationale: "Ensures test DB matches production exactly, including all ALTER TABLE migrations and FK constraint fixes"
metrics:
  duration: 2 min
  completed: 2026-02-07
---

# Phase 15 Plan 01: Vitest Foundation and Test Helpers Summary

**One-liner:** Vitest config with env vars, 7-module global mock setup, and in-memory SQLite test database factory replicating full production migration chain.

## What Was Done

### Task 1: Update vitest.config.ts with env vars and setup file (bc24808)

Updated the existing vitest config to add:

- `test.env` block with all 6 required environment variables (DATABASE_PATH, STORAGE_PATH, AUTH_SECRET, ADMIN_PASSWORD_HASH, NODE_ENV, REDIS_URL) injected before any module loads
- `test.setupFiles` pointing to `./src/__tests__/setup.ts`
- Preserved existing config (globals, environment, resolve.alias)

### Task 2: Create setup.ts global mocks and test-db.ts helper (ed9bf5b)

**setup.ts** - Global mock file with 7 `vi.mock()` calls:

1. `server-only` -- Empty object preventing "cannot import from Client Component" crash
2. `next/headers` -- Mock `cookies()` and `headers()` returning stub objects
3. `next/navigation` -- Mock `redirect`, `notFound`, `useRouter`, `usePathname`, `useSearchParams`
4. `next/cache` -- Mock `revalidatePath`, `revalidateTag`, `unstable_cache` (pass-through)
5. `ioredis` -- Mock constructor preventing TCP connection attempts
6. `react` -- Preserve all real exports, override `cache` with pass-through function
7. `bullmq` -- Mock `Queue` and `Worker` constructors preventing Redis operations

**test-db.ts** - In-memory database factory:

- `createTestDb()` returns `{ db, sqlite }` (Drizzle instance + raw better-sqlite3 handle)
- Replays exact migration chain from `client.ts initializeDatabase()`:
  - Base tables: photos, albums, photo_albums with indexes
  - Phase 11: `ALTER TABLE photos ADD COLUMN exif_data TEXT`
  - Phase 12: `ALTER TABLE photos ADD COLUMN width/height INTEGER`
  - Phase 13: Rebuild albums table with `tags TEXT` column and `ON DELETE SET NULL` FK constraint
  - `PRAGMA foreign_keys = ON`

## Task Commits

| Task | Name                                                 | Commit  | Key Files                                                |
| ---- | ---------------------------------------------------- | ------- | -------------------------------------------------------- |
| 1    | Update vitest.config.ts with env vars and setup file | bc24808 | vitest.config.ts                                         |
| 2    | Create setup.ts global mocks and test-db.ts helper   | ed9bf5b | src/**tests**/setup.ts, src/**tests**/helpers/test-db.ts |

## Decisions Made

| ID         | Decision                                                     | Rationale                                                        |
| ---------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| D-15-01-01 | Env vars in vitest.config.ts test.env                        | Injected before module load, prevents env.ts Zod crash           |
| D-15-01-02 | Setup file uses only vi.mock(), no imports of mocked modules | Vitest known issue: mocks fail with direct imports in setup      |
| D-15-01-03 | Migration replay instead of schema-based table creation      | Exact match with production DB including all ALTER TABLE history |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

| Check                           | Result             |
| ------------------------------- | ------------------ |
| `npx vitest run` no hang        | PASS (151ms total) |
| `npx vitest run` no crash       | PASS (exit 0)      |
| theme-tokens.test.ts passes     | PASS (58/58 tests) |
| setup.ts has 7 mock categories  | PASS               |
| test-db.ts exports createTestDb | PASS               |

## Next Phase Readiness

- **15-02 (Coverage and Test Scripts):** Ready. This plan provides the vitest config and setup file that 15-02 will extend with coverage configuration.
- **17 (Unit Tests):** Ready. Tests can import `createTestDb()` for database-dependent unit tests and rely on global mocks for Next.js/Redis modules.
- **18 (Integration Tests):** Ready. Same infrastructure applies.

## Self-Check: PASSED
