# Domain Pitfalls: Quality Hardening

**Domain:** Testing, error handling, performance optimization, tech debt for photography portfolio
**Researched:** 2026-02-06
**Confidence:** HIGH (all pitfalls verified by reading actual source code)

---

## Critical Pitfalls

Mistakes that cause rewrites, test suites that give false confidence, or regressions in production.

### Pitfall 1: Module-Scope Database Import Blocks Test Injection

**What goes wrong:** Repository classes import the production database singleton at module scope. Tests cannot inject an in-memory SQLite database without either refactoring or fragile module mocking.

**THIS PROJECT'S SPECIFIC RISK:** Both `SQLitePhotoRepository.ts` and `SQLiteAlbumRepository.ts` import `db` from `../client` at the top of the file:

```typescript
import { db } from "../client";
```

The `client.ts` module calls `initializeDatabase()` at module load time (line 140), which connects to the real SQLite file on disk. When a test file imports a repository, it triggers a real database connection immediately.

**Consequences:**

- Tests hit the production/development database instead of an isolated test database
- Tests are not isolated -- one test's data leaks into another
- Tests fail if the database file does not exist or has wrong schema
- Cannot run tests in CI without the real database file

**Prevention:**

- Refactor repositories to accept a database instance via constructor parameter:
  ```typescript
  export class SQLitePhotoRepository implements PhotoRepository {
    constructor(private db: typeof import("../client").db) {}
    // ... methods use this.db instead of imported db
  }
  ```
- Export a `createDatabase` factory from `client.ts` so tests can call `createDatabase(":memory:")`
- Keep the default export `db` for production use -- backwards compatible
- Alternative (less recommended): Use `vi.mock("@/infrastructure/database/client")` to replace the module in tests. This works but is brittle -- the mock must match the real module's shape exactly.

**Detection:** If tests pass but the test database file grows in size, tests are hitting the real database. If tests hang at startup, the client module is trying to connect to a non-existent file.

**Phase relevance:** Test infrastructure setup. Must be the FIRST thing done before any repository test can be written.

---

### Pitfall 2: Testing Repository Logic by Mocking Drizzle

**What goes wrong:** Developers mock Drizzle ORM's query builder chain (`db.select().from().where().limit()`) in tests. The tests verify mock behavior, not actual SQL execution. Queries that would fail against real SQLite pass in tests.

**Why it happens:** Mocking seems easier than setting up a test database. Drizzle's fluent API makes it tempting to mock each method in the chain.

**Consequences:**

- Tests pass but SQL has bugs (wrong joins, missing WHERE clauses, incorrect ORDER BY)
- Mock chain breaks whenever Drizzle ORM is updated
- No coverage of `toDomain`/`toDatabase` mapping with real data types (e.g., SQLite integers becoming JavaScript numbers)
- False confidence -- 100% mock-passing tests with 0% real SQL validation

**THIS PROJECT'S SPECIFIC RISK:** `SQLitePhotoRepository.toDomain()` does `JSON.parse(row.exifData)` on a text column. A mock would return pre-parsed objects, never catching the JSON.parse failure path. Also, `updatePhotoSortOrders` uses a transaction with sequential updates -- mocking the transaction behavior is complex and unreliable.

**Prevention:**

- Use real in-memory SQLite via `new Database(":memory:")` with Drizzle
- Create all tables in the test database using the same SQL as `initializeDatabase()`
- Each test starts with a fresh in-memory database (instant creation, ~1ms)
- Test real data round-trips: insert via `save()`, read via `findById()`, verify all fields match
- Reserve mocking for truly external services: Redis (BullMQ), network calls

**Detection:** If your test file has `vi.mock("drizzle-orm")` or mocks `db.select`, you are testing the mock, not the query.

**Phase relevance:** Integration testing phase. Establish the in-memory DB pattern in the first repository test.

---

### Pitfall 3: JSON.parse in Repository toDomain Crashes on Corrupt Data

**What goes wrong:** `SQLitePhotoRepository.toDomain()` calls `JSON.parse(row.exifData)` at line 125 with no try/catch. If the `exif_data` column contains corrupt, truncated, or malformed JSON, every page that loads photos will crash with an unhandled error.

**THIS PROJECT'S SPECIFIC RISK:** This is on the critical path for every public page (homepage, album pages) and every admin page that displays photos. A single corrupt row crashes the entire application for all users.

**Current code (vulnerable):**

```typescript
private toDomain(row: typeof photos.$inferSelect): Photo {
  return {
    // ...
    exifData: row.exifData ? JSON.parse(row.exifData) : null,
    // ...
  };
}
```

**Consequences:**

- Homepage crashes if any photo has corrupt EXIF JSON
- Album pages crash if any photo in the album has corrupt EXIF
- Admin dashboard crashes, preventing the admin from fixing the data
- Single corrupt database row takes down the entire site

**Prevention:**

- Wrap `JSON.parse` in try/catch, returning `null` on failure:
  ```typescript
  exifData: row.exifData ? (() => {
    try { return JSON.parse(row.exifData); }
    catch { return null; }
  })() : null,
  ```
- Or better: create a `safeParseJson<T>(json: string | null): T | null` utility
- Log corrupt JSON occurrences for investigation
- Add a test that verifies toDomain handles corrupt JSON gracefully

**Detection:** Search for `JSON.parse` calls in repository code that lack surrounding try/catch.

**Phase relevance:** Should be fixed immediately as a P0 bug, even before the quality milestone formally starts. This is a latent production crash waiting to happen.

---

### Pitfall 4: Testing API Routes Without Mocking Next.js Server-Only APIs

**What goes wrong:** Vitest imports API route handler functions directly, but the handlers call `cookies()` from `next/headers` (via `verifySession()`). `cookies()` only works within the Next.js request context. Tests crash with "cookies was called outside of a request scope" or similar errors.

**THIS PROJECT'S SPECIFIC RISK:** All 8 API route files call `verifySession()` as their first action, which internally uses `cookies()` from `next/headers`. The `cookies()` function is a Next.js server-only API that requires the Next.js request lifecycle.

**Consequences:**

- Cannot unit test any API route without mocking the auth module
- Mock must handle both "authenticated" and "unauthenticated" paths
- Tests become coupled to the internal implementation of `verifySession()`

**Prevention:**

Two approaches, not mutually exclusive:

**Approach A (recommended for unit tests):** Mock the auth module:

```typescript
vi.mock("@/infrastructure/auth", () => ({
  verifySession: vi.fn().mockResolvedValue({ userId: "test-admin" }),
}));
```

This is appropriate because auth is a cross-cutting concern, not the logic being tested.

**Approach B (recommended for auth flow tests):** Use Playwright E2E tests that go through the real Next.js server. Test login, session creation, and protected route access end-to-end.

**Detection:** If API route tests crash before reaching your assertion, check if `cookies()` or `headers()` is being called outside the Next.js context.

**Phase relevance:** API route integration testing. Decide on the mocking strategy before writing the first API test.

---

### Pitfall 5: Error Boundaries That Swallow Errors Without Logging

**What goes wrong:** error.tsx files catch errors and render a nice "Something went wrong" UI, but the error object is never logged. Bugs are hidden from the developer. Users see a nice page but the underlying issue is never diagnosed or fixed.

**Why it happens:** Next.js error.tsx receives the error as a prop, but the component is a client component (`"use client"`). Console.error in client components goes to the browser console, not the server logs. Developers forget to add logging because the UI looks correct.

**Consequences:**

- Production errors are invisible to the developer
- Same error recurs indefinitely because nobody knows about it
- Users see "Something went wrong" but the developer does not know what went wrong

**Prevention:**

- Always log the error in a `useEffect` (client-side logging is better than nothing):
  ```typescript
  "use client";
  export default function Error({ error, reset }) {
    useEffect(() => {
      console.error("[ErrorBoundary]", error);
    }, [error]);
    return <div>Something went wrong. <button onClick={reset}>Try again</button></div>;
  }
  ```
- For server-side logging, consider a `reportError()` utility that writes to a file or sends to a logging endpoint
- At minimum, error.tsx must render the `reset` button so users can attempt recovery
- global-error.tsx must render its own `<html>` and `<body>` tags (it replaces the root layout)

**Detection:** If error.tsx has no `useEffect` with `console.error`, errors are being swallowed.

**Phase relevance:** Error handling implementation. Every error.tsx file must include logging from day one.

---

## Moderate Pitfalls

Mistakes that cause delays, flaky tests, or quality gaps.

### Pitfall 6: Test Database Schema Drift from Production

**What goes wrong:** The in-memory test database is created with CREATE TABLE SQL that does not match the production database. Tests pass on the test schema but production has different columns, constraints, or indexes due to manual migrations.

**THIS PROJECT'S SPECIFIC RISK:** The `initializeDatabase()` function in `client.ts` has inline CREATE TABLE statements AND migration logic (ALTER TABLE for exif_data, width, height, tags, FK constraint fix). The test database helper must replicate ALL of this, or test schema diverges from production.

Evidence of existing drift:

- `albums` CREATE TABLE statement (line 38-47 of client.ts) does not include `tags TEXT` column
- Drizzle schema (schema.ts) has `tags: text("tags")` on albums
- The `tags` column was added via ALTER TABLE in a migration that is NOT in the CREATE TABLE

**Consequences:**

- Tests pass but production queries fail (column not found)
- New columns added via ALTER TABLE are missing from test schema
- FK constraint behavior differs between test and production

**Prevention:**

- Create a single source of truth for the test database schema -- use the SAME SQL as `initializeDatabase()` including all migrations
- Or better: extract the schema DDL into a shared function used by both production init and test helper
- After any migration, update the test database helper to match
- Add a test that compares `PRAGMA table_info` output from test DB vs production schema expectations

**Detection:** If a repository test passes but the same operation fails in development, the test schema is stale.

**Phase relevance:** Test infrastructure setup. The test DB helper must be comprehensive from the start.

---

### Pitfall 7: Overly Granular Error Boundaries

**What goes wrong:** Adding error.tsx to every route segment (every page, every layout) creates a confusing user experience where different parts of the page show error states independently, and the error messages are too generic to be helpful.

**Prevention:**

- Add error boundaries at meaningful UI boundaries, not file boundaries:
  - Root: catch-all safety net
  - `albums/[id]`: "This album could not be loaded" (specific)
  - `admin/(protected)`: "Admin page error" (specific)
- Do NOT add error.tsx to: homepage (root catches it), individual admin pages (admin/(protected) catches them), the login page (simple form, unlikely to error)
- Each error.tsx should have a different message explaining what went wrong contextually
- 3-5 error.tsx files is sufficient for this app's route structure

**Detection:** If you have more error.tsx files than route groups, you probably have too many.

**Phase relevance:** Error handling implementation.

---

### Pitfall 8: Coverage Metrics Driving Low-Value Tests

**What goes wrong:** After adding @vitest/coverage-v8, developers see 15% coverage and feel pressure to reach 80%+. They write tests for trivial code: barrel re-exports (`index.ts`), type definitions, Tailwind class strings, and static configuration. Coverage number goes up, but test value does not.

**Prevention:**

- Target coverage only on files with logic:
  - `infrastructure/services/` (imageService, exifService)
  - `infrastructure/database/repositories/` (SQL queries, data mapping)
  - `infrastructure/auth/` (session, password)
  - `infrastructure/storage/` (file operations)
  - `lib/imageLoader.ts` (URL construction)
- Exclude from coverage: `domain/` (interfaces only), `presentation/` (deferred), `app/` (tested via E2E)
- Configure exclude patterns in vitest.config.ts coverage section
- Measure coverage on infrastructure layer only, not total codebase

**Detection:** If tests are asserting that an import re-exports correctly or that a TypeScript interface has certain properties, the test has no value.

**Phase relevance:** Test authoring. Set coverage expectations in vitest.config.ts before writing tests.

---

### Pitfall 9: Parallel Image Processing Causing Memory Pressure

**What goes wrong:** Converting sequential WebP+AVIF generation to `Promise.all` doubles peak memory usage. For large images (50MP = ~144MB per Sharp pipeline), this means 288MB per image instead of 144MB. With worker concurrency of 2, peak memory could reach ~576MB.

**THIS PROJECT'S SPECIFIC RISK:** The worker already limits concurrency to 2 with a comment: "50MP images use ~144MB each." The `.clone()` approach shares the input buffer but each output format still requires its own processing memory.

**Prevention:**

- Measure memory before parallelizing: run the worker with `--max-old-space-size` logging
- If parallelizing, consider reducing worker concurrency from 2 to 1 to compensate
- Only parallelize WebP+AVIF for the same width (safe because clone() reuses decoded data)
- Do NOT parallelize across different widths (that would multiply memory by 4)
- Test with the largest image in the portfolio (check max dimensions)

**Detection:** Worker crashes with "JavaScript heap out of memory" or "Killed" by OS OOM killer.

**Phase relevance:** Performance optimization. Measure first, optimize carefully.

---

### Pitfall 10: Adding Bundle Analyzer Without Understanding Next.js Build Output

**What goes wrong:** @next/bundle-analyzer shows large chunks and developers start "optimizing" by trying to remove packages they do not understand. They end up breaking functionality (removing a needed polyfill, tree-shaking an import that is actually used server-side, etc.).

**Prevention:**

- Understand what to expect: Next.js bundles include framework code (~100KB), React (~40KB), and app code
- Server components do NOT appear in the client bundle (they are server-only)
- `"use client"` components DO appear in the client bundle
- The app uses `output: "standalone"` which affects the server bundle structure
- Key things to check: Is Sharp appearing in the client bundle? (it should not), Is better-sqlite3 in the client bundle? (it should not), Are any large presentation libraries unexpectedly bundled?
- Treat the first analysis as a baseline, not a call to action

**Detection:** If the client bundle shows Node.js-only packages (sharp, better-sqlite3, bcrypt), there is a "use client" directive pulling server code into the client.

**Phase relevance:** Performance optimization. Run analyzer, record baseline, then make targeted changes.

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

### Pitfall 11: Vitest Global Imports Conflicting with TypeScript

**What goes wrong:** The vitest config has `globals: true` (already set), which makes `describe`, `it`, `expect` available without imports. But TypeScript does not know about these globals unless `vitest/globals` is added to the tsconfig types.

**Prevention:**

- Add to tsconfig.json: `"types": ["vitest/globals"]` (or use a `/// <reference types="vitest/globals" />` triple-slash directive in test files)
- Or: set `globals: false` in vitest.config.ts and import explicitly in each test file: `import { describe, it, expect } from 'vitest'`
- The existing config already has `globals: true`, so the tsconfig types approach is needed

**Detection:** TypeScript errors like "Cannot find name 'describe'" in test files, even though tests run fine.

**Phase relevance:** Test infrastructure setup.

---

### Pitfall 12: FK Constraint Fix Migration Breaking Existing Data

**What goes wrong:** Fixing the `coverPhotoId` FK constraint requires recreating the `albums` table in SQLite (SQLite does not support `ALTER TABLE ... ALTER CONSTRAINT`). The migration script drops and recreates the table, potentially losing data if the INSERT...SELECT is incorrect.

**THIS PROJECT'S SPECIFIC RISK:** The `initializeDatabase()` function in `client.ts` already has a FK fix migration (lines 96-128) that recreates the albums table. However, this migration checks `PRAGMA foreign_key_list` at startup. If the fix was already applied, it is a no-op. If it was NOT applied, it runs every server start -- which is correct but makes the migration non-idempotent in edge cases.

**Prevention:**

- The existing migration in `client.ts` (lines 96-128) is already correct and handles this
- Verify it ran successfully by checking: `PRAGMA foreign_key_list(albums)` should show `on_delete: SET NULL` for `cover_photo_id`
- Do NOT add a second migration for the same fix
- Test the migration on a database backup before applying to production

**Detection:** Run `PRAGMA foreign_key_list(albums)` and verify the `on_delete` column shows `SET NULL` for the `cover_photo_id` foreign key.

**Phase relevance:** Tech debt cleanup. Verify the existing migration rather than writing a new one.

---

### Pitfall 13: Test Fixture Images Too Large

**What goes wrong:** Test fixtures include high-resolution photos (20MB+ each) for testing Sharp image processing. Test suite becomes slow and the repository grows in size.

**Prevention:**

- Use tiny test images: 10x10 or 100x100 JPEG/PNG
- Create fixture images programmatically in test setup using Sharp:
  ```typescript
  const testImage = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .jpeg()
    .toBuffer();
  ```
- For EXIF tests, use the smallest possible image with valid EXIF headers
- Store fixture images in `tests/fixtures/` and add them to `.gitignore` if generated

**Detection:** If `git status` shows large binary files in the test fixtures directory, the images are too big.

**Phase relevance:** Test infrastructure setup.

---

## Phase-Specific Warnings

| Phase Topic         | Likely Pitfall                         | Mitigation                                                        |
| ------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| Test infrastructure | Module-scope DB import (Pitfall 1)     | Refactor to constructor injection before writing repository tests |
| Test infrastructure | Schema drift (Pitfall 6)               | Replicate ALL migrations in test DB helper                        |
| Test infrastructure | Vitest globals (Pitfall 11)            | Add `vitest/globals` to tsconfig types                            |
| Test infrastructure | Fixture image size (Pitfall 13)        | Generate tiny images programmatically                             |
| Unit testing        | Mocking Drizzle (Pitfall 2)            | Use real in-memory SQLite, not mocks                              |
| Unit testing        | Coverage metrics (Pitfall 8)           | Target infrastructure layer, exclude trivial code                 |
| API route testing   | Next.js server APIs (Pitfall 4)        | Mock auth module, not Next.js internals                           |
| Error handling      | Swallowing errors (Pitfall 5)          | Every error.tsx must log the error                                |
| Error handling      | Overly granular boundaries (Pitfall 7) | 3-5 error.tsx files max                                           |
| Error handling      | JSON.parse crash (Pitfall 3)           | Fix toDomain() immediately -- P0 bug                              |
| Performance         | Memory pressure (Pitfall 9)            | Measure before parallelizing Sharp                                |
| Performance         | Bundle misinterpretation (Pitfall 10)  | Understand baseline before optimizing                             |
| Tech debt           | FK migration (Pitfall 12)              | Verify existing migration, do not duplicate                       |

## Sources

- Direct source code analysis of all files under `src/`
- `infrastructure/database/client.ts`: lines 1-141 (module-scope init, migration logic)
- `infrastructure/database/repositories/SQLitePhotoRepository.ts`: line 1 (db import), line 125 (JSON.parse)
- `infrastructure/database/repositories/SQLiteAlbumRepository.ts`: line 1 (db import)
- `vitest.config.ts`: existing configuration with `globals: true`
- `package.json`: vitest 4.0.18, better-sqlite3 12.6.2
- Worker concurrency comment: `imageProcessor.ts` line 83 ("50MP images use ~144MB each")

---

_Pitfalls research for: Quality hardening of photography portfolio_
_Researched: 2026-02-06_
