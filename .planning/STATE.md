# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Let the photos speak for themselves -- a clean, distraction-free experience where the photography is the focus
**Current focus:** Phase 18 - Worker Resilience & Tech Debt

## Current Position

Phase: 18 of 19 (Worker Resilience & Tech Debt)
Plan: 1 of 3 in current phase (plans 1 and 3 complete, plan 2 pending)
Status: In progress
Last activity: 2026-02-08 -- Completed 18-01-PLAN.md (Worker Resilience)

Progress: [███████░░░] 71% (10/14 plans)

## Performance Metrics

**v1.0 Velocity:**

- Total plans completed: 29
- Average duration: 3 min
- Total execution time: 99 min

**v1.1 Velocity:**

- Total plans completed: 11
- Average duration: 3 min
- Total execution time: 32 min

**v1.2 Velocity:**

- Total plans completed: 10
- Average duration: 3 min
- Total execution time: 30 min

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

| ID         | Decision                                                                         | Phase-Plan |
| ---------- | -------------------------------------------------------------------------------- | ---------- |
| D-15-01-01 | Env vars in vitest.config.ts test.env (not .env.test)                            | 15-01      |
| D-15-01-02 | Setup file uses only vi.mock(), no imports of mocked modules                     | 15-01      |
| D-15-01-03 | test-db.ts replays exact migration chain from client.ts                          | 15-01      |
| D-16-01-01 | global-error.tsx uses inline styles (not Tailwind) since root layout is replaced | 16-01      |
| D-16-01-02 | Admin loading uses spinner (animate-spin) not skeleton grid                      | 16-01      |
| D-16-02-01 | Inner throw + outer catch pattern for image route ENOENT fallback                | 16-02      |
| D-16-02-02 | Standardized validation error message to "Validation failed" across all routes   | 16-02      |
| D-16-03-01 | safeParseExifJson returns ExifData (not Record<string, unknown>) for type safety | 16-03      |
| D-16-03-02 | Tailwind red utility classes for rejection UI (not semantic status tokens)       | 16-03      |
| D-17-02-01 | Runtime-generated 400x300 JPEG for derivative tests (avoid repo bloat)           | 17-02      |
| D-17-02-02 | Test bcrypt via direct bcrypt.compare (avoid env.ADMIN_PASSWORD_HASH coupling)   | 17-02      |
| D-17-02-03 | Expired token test uses 0s expiry + 1.1s delay for reliable detection            | 17-02      |
| D-17-01-01 | Fixed async transaction callbacks to synchronous (better-sqlite3 v12 rejects)    | 17-01      |

### Pending Todos

None.

### Blockers/Concerns

- Docker not installed on development machine -- Redis service not tested (docker-compose.yml created and ready)
- Pre-existing TS error in mocks.smoke.test.ts (Property 'get' does not exist on type 'Promise<ReadonlyRequestCookies>') -- does not affect builds

## Session Continuity

Last session: 2026-02-08
Stopped at: Completed 18-01-PLAN.md (Worker Resilience) -- Phase 18 plan 2 still pending
Resume file: .planning/phases/18-worker-resilience-tech-debt/18-02-PLAN.md
