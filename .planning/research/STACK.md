# Stack Research: Quality Hardening Tools

**Domain:** Testing, error handling, and performance optimization for Next.js 16 photography portfolio
**Researched:** 2026-02-06
**Confidence:** HIGH (versions verified from npm registry and installed packages)

## Current State Assessment

Before recommending new tools, here is what already exists:

| Already Installed | Version                     | Status                                               |
| ----------------- | --------------------------- | ---------------------------------------------------- |
| vitest            | ^4.0.18 (installed: 4.0.18) | Configured in `vitest.config.ts`, zero tests written |
| @playwright/test  | ^1.58.2 (installed: 1.58.2) | Installed, zero tests written                        |
| zod               | ^4.3.6                      | Already used for `env.ts` validation                 |
| eslint + prettier | eslint ^9, prettier ^3.8.1  | Running via lint-staged pre-commit                   |
| typescript        | ^5                          | Strict mode enabled, `tsc --noEmit` script exists    |

**Key insight:** The project already has the core testing framework (Vitest 4) and E2E framework (Playwright) installed. The quality gap is not missing tools -- it is missing tests, coverage reporting, error boundaries, and performance instrumentation.

## Recommended Stack Additions

### Testing: Coverage Reporting

| Technology          | Version | Purpose                                  | Why Recommended                                                                                                                                                                                                                                                    |
| ------------------- | ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| @vitest/coverage-v8 | ^4.0.18 | Code coverage via V8's built-in coverage | Must match vitest major version (4.x). V8 coverage is faster than Istanbul and requires no source instrumentation. Works out-of-the-box with the existing vitest.config.ts. No configuration changes needed beyond adding `coverage.provider: 'v8'` to the config. |

**Why not @vitest/coverage-istanbul:** Istanbul requires code instrumentation which adds overhead. V8 coverage is native to Node.js, faster for CI, and produces identical report formats (lcov, text, html). The only reason to prefer Istanbul is if you need branch-level coverage on code V8 instruments poorly (e.g., decorators) -- not applicable here since this codebase uses plain TypeScript interfaces and functions.

### Testing: Database Test Fixtures

No additional library needed. The testing strategy for repositories should use a **real in-memory SQLite database** via better-sqlite3 (already installed). This is superior to mocking Drizzle ORM because:

1. Repository tests verify actual SQL execution, not mock behavior
2. better-sqlite3 supports `:memory:` databases that are instant to create/destroy
3. Drizzle's type system makes mocking impractical -- you would need to mock the entire query builder chain

**Pattern:** Create a test helper that instantiates `drizzle({ client: new Database(':memory:'), schema })`, runs the table creation SQL, and returns it. Each test file gets a fresh database. This requires zero new dependencies.

### Performance: Bundle Analysis

| Technology            | Version | Purpose                                 | Why Recommended                                                                                                                                                                                        |
| --------------------- | ------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| @next/bundle-analyzer | 16.1.6  | Visualize JavaScript bundle composition | Version must match Next.js version (16.1.6). Official Vercel package. Wraps webpack-bundle-analyzer with Next.js integration. One-time setup in next.config.ts, run with `ANALYZE=true npm run build`. |

**Why this specific version:** @next/bundle-analyzer is published in lockstep with Next.js versions. Using 16.1.6 ensures compatibility with the installed Next.js 16.1.6. Verified via npm registry that 16.1.6 exists.

### Error Handling: No New Runtime Libraries Needed

The project already has zod (validation), Next.js App Router (error.tsx boundaries), and standard try/catch patterns. What is missing is not a library but rather the **implementation** of:

1. **error.tsx** files in route segments (Next.js built-in, zero dependencies)
2. **not-found.tsx** files for 404 handling (Next.js built-in, zero dependencies)
3. **global-error.tsx** for root error boundary (Next.js built-in, zero dependencies)
4. Consistent error response shapes in API routes (use zod for request validation, already installed)
5. Server action error handling patterns (return `{ error: string }` vs throwing)

Currently, the codebase has ZERO error.tsx, not-found.tsx, or global-error.tsx files. API routes do manual validation without zod (e.g., `const { description } = body as { description: string | null }` in the photo PATCH route -- no validation). These are implementation gaps, not dependency gaps.

## Supporting Libraries

| Library    | Version | Purpose                      | When to Use                                                                                                                          |
| ---------- | ------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| @vitest/ui | ^4.0.18 | Browser-based test runner UI | Optional. Useful during initial test authoring to visually browse and debug test results. Run with `vitest --ui`. Not needed for CI. |

## Development Tools (No Install Required)

| Tool                         | Purpose                | Notes                                                                                                   |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`               | Type checking          | Already configured as `npm run typecheck`. Run in CI.                                                   |
| `ANALYZE=true npm run build` | Bundle analysis        | Requires @next/bundle-analyzer to be added to next.config.ts                                            |
| SQLite PRAGMA commands       | Schema validation      | `PRAGMA table_info(tableName)`, `PRAGMA foreign_key_check` -- run via better-sqlite3, no new dependency |
| `npx drizzle-kit check`      | Schema drift detection | Already installed as dev dependency (drizzle-kit ^0.31.8). Validates schema.ts matches actual DB.       |

## Installation

```bash
# Required additions (dev dependencies only -- no runtime impact)
npm install -D @vitest/coverage-v8@^4.0.18 @next/bundle-analyzer@16.1.6

# Optional (nice-to-have for local development)
npm install -D @vitest/ui@^4.0.18
```

Total new dependencies: 2 required, 1 optional. All dev-only.

## Vitest Configuration Update

The existing `vitest.config.ts` needs minor additions for coverage:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/app/**", // Next.js pages (tested via E2E/integration)
        "src/**/*.d.ts",
        "src/**/index.ts", // Re-export barrels
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/domain": path.resolve(__dirname, "./src/domain"),
      "@/application": path.resolve(__dirname, "./src/application"),
      "@/infrastructure": path.resolve(__dirname, "./src/infrastructure"),
      "@/presentation": path.resolve(__dirname, "./src/presentation"),
    },
  },
});
```

## next.config.ts Update for Bundle Analyzer

```typescript
import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    loader: "custom",
    loaderFile: "./src/lib/imageLoader.ts",
  },
};

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default analyzer(nextConfig);
```

## Package.json Script Additions

```json
{
  "scripts": {
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "analyze": "ANALYZE=true npm run build"
  }
}
```

## Alternatives Considered

| Recommended                     | Alternative                    | When to Use Alternative                                                                                                                                                                     |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @vitest/coverage-v8             | @vitest/coverage-istanbul      | Only if you need coverage of decorator-heavy code or runtime-transpiled code. Not applicable here.                                                                                          |
| @next/bundle-analyzer           | source-map-explorer            | If you want to analyze a single chunk file rather than the full build. Bundle analyzer gives the better overview for initial investigation.                                                 |
| In-memory SQLite for tests      | Mocking Drizzle with vi.mock() | Never for repository tests. Mocking the ORM means you are testing mock behavior, not SQL correctness. Use mocks only for things that are expensive or external (Redis, Sharp, file system). |
| Zod for API validation          | No validation (current state)  | Never. The current `as` type assertions in API routes provide zero runtime safety.                                                                                                          |
| No dedicated error tracking lib | Sentry / PostHog               | Only if deploying publicly and needing production error monitoring. For a self-hosted single-user app, structured console logging is sufficient.                                            |

## What NOT to Use

| Avoid                                     | Why                                                                                                                                                                                                       | Use Instead                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Jest                                      | Vitest 4 is already installed and configured. Jest requires separate ts-jest or babel config. Vitest is faster and uses the same config as Vite.                                                          | Vitest 4 (already installed)                                            |
| Cypress                                   | Already have Playwright installed. Adding Cypress duplicates E2E capability with a heavier runtime. Playwright is faster and supports all major browsers.                                                 | Playwright (already installed)                                          |
| React Testing Library                     | Out of scope for this milestone. The focus is business logic and infrastructure testing, not component rendering. RTL can be added later if component tests are needed.                                   | Vitest for pure logic tests                                             |
| msw (Mock Service Worker)                 | This app does not call external HTTP APIs. All data comes from SQLite and local filesystem. MSW is for mocking fetch calls to external services.                                                          | Direct function testing                                                 |
| Supertest / node-test-helpers             | Next.js API routes are not Express handlers. They use the Web Fetch API (Request/Response). Testing them requires either calling the handler function directly or using Playwright for integration tests. | Direct handler invocation in Vitest, or Playwright for HTTP-level tests |
| ts-node for test execution                | Vitest 4 handles TypeScript natively via esbuild. No separate TypeScript execution runtime needed.                                                                                                        | Vitest's built-in TypeScript support                                    |
| nyc (Istanbul CLI)                        | Legacy coverage tool. @vitest/coverage-v8 integrates directly with Vitest's test runner.                                                                                                                  | @vitest/coverage-v8                                                     |
| webpack-bundle-analyzer (standalone)      | @next/bundle-analyzer wraps this with Next.js-specific configuration. Using it standalone requires manual webpack config extraction.                                                                      | @next/bundle-analyzer                                                   |
| Dedicated logging library (winston, pino) | Single-user self-hosted app. Console logging is sufficient. Adding a logging framework adds complexity without proportional benefit at this scale.                                                        | console.error/console.log with structured messages                      |
| Error tracking SaaS (Sentry, Bugsnag)     | Self-hosted single-admin app. No external users to monitor. Error boundaries + console logging covers the use case.                                                                                       | Next.js error.tsx + console.error                                       |

## Testing Strategy by Layer

This informs what gets tested and how:

| Layer                                | What to Test                                                   | How to Test                                | Mocking Strategy                              |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| domain/entities                      | Interface definitions only -- nothing to test                  | Skip (no logic)                            | N/A                                           |
| domain/repositories                  | Interface definitions only -- nothing to test                  | Skip (no logic)                            | N/A                                           |
| infrastructure/database/repositories | SQL queries, toDomain/toDatabase mapping, transaction behavior | Vitest + in-memory SQLite                  | Real DB, no mocks                             |
| infrastructure/services/imageService | Derivative generation, blur placeholder, metadata extraction   | Vitest + fixture images (small test JPEGs) | Real Sharp (fast on small images)             |
| infrastructure/services/exifService  | EXIF parsing, field mapping, null handling                     | Vitest + fixture images with known EXIF    | Real exif-reader + Sharp                      |
| infrastructure/auth                  | Session creation/verification, password hashing, rate limiting | Vitest                                     | Mock Redis for rate limiter, real jose/bcrypt |
| infrastructure/storage               | File save/delete operations                                    | Vitest + temp directories (os.tmpdir())    | Real filesystem                               |
| infrastructure/jobs                  | Job enqueueing, worker event handlers                          | Vitest                                     | Mock BullMQ/Redis (external service)          |
| app/api routes                       | HTTP request/response, auth checks, validation                 | Vitest (call handler functions directly)   | Mock repositories (inject via constructor)    |
| presentation components              | Not in scope for this milestone                                | Defer                                      | N/A                                           |

**Key observation:** The application/services layer is empty (.gitkeep files only). Business logic currently lives directly in API routes and infrastructure services. This is a tech debt item -- consider extracting shared logic into application services as part of this milestone to make it testable.

## Testing Architecture: Repository Test Helper Pattern

The single most important test infrastructure to build is the in-memory database helper. Here is the recommended pattern:

```typescript
// src/__tests__/helpers/test-db.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/infrastructure/database/schema";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  // Create tables (same SQL as client.ts initializeDatabase)
  sqlite.exec(`
    CREATE TABLE photos (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      original_filename TEXT NOT NULL,
      blur_data_url TEXT,
      exif_data TEXT,
      width INTEGER,
      height INTEGER,
      status TEXT NOT NULL DEFAULT 'processing',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE photo_albums (
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (photo_id, album_id)
    );
    CREATE INDEX photo_albums_photo_idx ON photo_albums(photo_id);
    CREATE INDEX photo_albums_album_idx ON photo_albums(album_id);
  `);

  return drizzle({ client: sqlite, schema });
}
```

**Challenge:** The current repository implementations import `db` directly from `../client` at module scope. To make them testable with an injected database, the repositories need refactoring to accept the database instance via constructor injection instead of importing it. This is the key refactoring that unblocks repository testing.

## Error Handling Gap Analysis

Current state vs desired state:

| Area                      | Current                                     | Desired                                                            | Tool Needed                |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------------ | -------------------------- |
| Route error boundaries    | None (zero error.tsx files)                 | error.tsx in admin, public, and root layouts                       | None (Next.js built-in)    |
| 404 pages                 | None (zero not-found.tsx)                   | Custom not-found.tsx for public routes                             | None (Next.js built-in)    |
| Global error boundary     | None                                        | global-error.tsx at app root                                       | None (Next.js built-in)    |
| API request validation    | Type assertions (`as`)                      | Zod schemas for all request bodies                                 | Zod (already installed)    |
| Upload error recovery     | Silent failure (empty catch)                | User-facing error messages, retry UI                               | None (implementation only) |
| Image processing failures | Status set to "error", no user notification | Admin UI shows error state with retry option                       | None (implementation only) |
| Database errors           | Unhandled (thrown to framework)             | Caught and mapped to user-friendly responses                       | None (implementation only) |
| Redis unavailability      | Silently swallowed (empty catch block)      | Logged with structured message, graceful degradation already works | None (implementation only) |

## Performance Optimization: What to Measure

| Metric                   | How to Measure                                              | Tool                               |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------- |
| Client JS bundle size    | `ANALYZE=true npm run build`                                | @next/bundle-analyzer (new)        |
| Image serving latency    | Already has immutable cache headers; measure cache hit rate | Browser DevTools / Lighthouse      |
| SQLite query performance | `EXPLAIN QUERY PLAN` on critical queries                    | better-sqlite3 (already installed) |
| Build time               | `time npm run build`                                        | None needed                        |
| Largest Contentful Paint | Lighthouse audit                                            | Browser DevTools                   |

**Notable finding:** The image serving route reads files from disk on every request (`readFile`). For a self-hosted single-user app this is fine, but the immutable cache headers (`max-age=31536000, immutable`) mean the browser will cache aggressively after first load. No CDN or in-memory cache needed at this scale.

## Confidence Assessment

| Area                      | Level  | Reason                                                                            |
| ------------------------- | ------ | --------------------------------------------------------------------------------- |
| Vitest + coverage-v8      | HIGH   | Already installed, versions verified from npm registry                            |
| In-memory SQLite testing  | HIGH   | better-sqlite3 `:memory:` is well-documented, standard pattern                    |
| @next/bundle-analyzer     | HIGH   | Version 16.1.6 verified in npm registry, matches Next.js version                  |
| Error boundary patterns   | HIGH   | Standard Next.js App Router conventions, well-documented                          |
| Zod for API validation    | HIGH   | Already installed and used in env.ts, same pattern applies to routes              |
| Repository DI refactoring | MEDIUM | Pattern is sound but requires touching all repository imports across the codebase |

## Sources

- npm registry: `npm view @vitest/coverage-v8@4.0.18 version` -- verified 4.0.18 exists
- npm registry: `npm view @next/bundle-analyzer@16.1.6 version` -- verified 16.1.6 exists
- npm registry: `npm view vitest@4 peerDependencies` -- verified @types/node ^20 compatibility
- Installed packages: vitest 4.0.18, @playwright/test 1.58.2, next 16.1.6 (from node_modules)
- Project source: vitest.config.ts (existing config with path aliases)
- Project source: infrastructure/database/client.ts (DB initialization pattern)
- Project source: infrastructure/database/repositories/\*.ts (current import pattern)
- Project source: app/api/admin/upload/route.ts (current error handling pattern)
- Project source: infrastructure/config/env.ts (existing Zod validation pattern)

---

_Stack research for: Quality hardening of Next.js 16 photography portfolio_
_Researched: 2026-02-06_
