# Phase 15: Testing Infrastructure - Research

**Researched:** 2026-02-06
**Domain:** Vitest testing setup, module mocking, in-memory SQLite, Sharp test fixtures, coverage reporting
**Confidence:** HIGH

## Summary

Phase 15 establishes the test infrastructure for the entire v1.2 milestone. The project already has Vitest 4.0.18 installed with a minimal `vitest.config.ts` (globals + node environment + path aliases), but no setup files, no mocks, no coverage provider, and no test files exist yet.

The core challenge is that the infrastructure layer has multiple module-level side effects that will crash or hang in a test environment: `server-only` throws on import outside Next.js, `next/headers` and `next/cache` and `react.cache` are unavailable, `ioredis` attempts real TCP connections to Redis (causing hangs), `better-sqlite3` opens a file-based database, and the `env.ts` module validates required environment variables via Zod on import. All of these must be handled before any test file can import infrastructure code.

The recommended approach is: (1) a Vitest setup file that mocks Next.js server APIs and IORedis before any test runs, (2) a test database helper that creates an in-memory SQLite database and runs the full migration chain from `client.ts`, (3) programmatically-generated tiny fixture images for Sharp/EXIF testing, and (4) `@vitest/coverage-v8` configured to target the `src/infrastructure/` layer.

**Primary recommendation:** Use a single `vitest.setup.ts` file with `vi.mock()` calls for `server-only`, `next/headers`, `next/navigation`, `next/cache`, `react`, and `ioredis`. Create a `createTestDb()` helper that mirrors the `initializeDatabase()` migration chain using `:memory:` SQLite. Generate fixture images with `sharp({ create: ... })` in a script, committing the tiny resulting files.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library             | Version | Purpose                                           | Why Standard                                                                     |
| ------------------- | ------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| vitest              | 4.0.18  | Test runner and assertion library                 | Already installed; Vite-native, fast, built-in mocking                           |
| @vitest/coverage-v8 | 4.0.18  | V8-based code coverage                            | Must match vitest version exactly; uses Node.js V8 inspector for native coverage |
| better-sqlite3      | 12.6.2  | In-memory SQLite for test DB                      | Already a project dependency; supports `:memory:` mode                           |
| drizzle-orm         | 0.45.1  | ORM for test database queries                     | Already a project dependency; same ORM used in production                        |
| sharp               | 0.34.5  | Generate fixture images and test image processing | Already a project dependency; can create images from scratch                     |

### Supporting

| Library     | Version | Purpose                       | When to Use                                     |
| ----------- | ------- | ----------------------------- | ----------------------------------------------- |
| exif-reader | 2.0.3   | Parse EXIF in test assertions | Already installed; verify EXIF extraction works |

### Alternatives Considered

| Instead of                       | Could Use                  | Tradeoff                                                                                                                   |
| -------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| @vitest/coverage-v8              | @vitest/coverage-istanbul  | Istanbul requires source transformation; v8 is zero-config with Node.js                                                    |
| ioredis-mock                     | vi.mock('ioredis')         | ioredis-mock adds a dependency; simple vi.mock is sufficient since we only need to prevent hangs, not test Redis behavior  |
| drizzle-kit push for test schema | Raw SQL matching client.ts | drizzle-kit push requires a config file and is async; reusing the same SQL from initializeDatabase() ensures schema parity |

**Installation:**

```bash
npm install -D @vitest/coverage-v8@4.0.18
```

No other new dependencies required -- all other libraries are already installed.

## Architecture Patterns

### Recommended Test File Structure

```
src/
├── __tests__/                    # Test infrastructure (setup, helpers, fixtures)
│   ├── setup.ts                  # Vitest setup file (mocks Next.js, Redis)
│   ├── helpers/
│   │   └── test-db.ts            # In-memory SQLite test database helper
│   └── fixtures/
│       ├── generate-fixtures.ts  # Script to generate fixture images
│       ├── tiny-landscape.jpg    # 8x6 JPEG with EXIF data (~1-2KB)
│       ├── tiny-portrait.jpg     # 6x8 JPEG with EXIF data (~1-2KB)
│       └── tiny-no-exif.png      # 8x8 PNG without EXIF (~200 bytes)
├── infrastructure/
│   ├── __tests__/                # Infrastructure smoke tests (Phase 15)
│   │   ├── mocks.smoke.test.ts   # Smoke: Next.js + Redis mocks work
│   │   ├── test-db.smoke.test.ts # Smoke: in-memory DB schema matches
│   │   └── fixtures.smoke.test.ts# Smoke: fixture images loadable by Sharp
│   ├── database/
│   ├── auth/
│   ├── services/
│   ├── jobs/
│   └── storage/
```

### Pattern 1: Setup File with vi.mock for Module-Level Side Effects

**What:** A single setup file that mocks all modules causing crashes/hangs before any test imports run.
**When to use:** Always -- runs before every test file via `setupFiles` config.
**Why:** Several infrastructure modules have side effects at the module level (IORedis connects to Redis, `server-only` throws, env.ts validates). These must be mocked globally.

```typescript
// src/__tests__/setup.ts
import { vi } from "vitest";

// 1. Mock server-only (throws "cannot import from Client Component" outside Next.js)
vi.mock("server-only", () => ({}));

// 2. Mock next/headers (cookies() and headers() unavailable outside Next.js)
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map()),
}));

// 3. Mock next/navigation (redirect, notFound unavailable outside Next.js)
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// 4. Mock next/cache (revalidatePath, revalidateTag unavailable)
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
}));

// 5. Mock ioredis (prevents real TCP connections that cause test hangs)
vi.mock("ioredis", () => {
  const MockRedis = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    quit: vi.fn(),
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    status: "ready",
  }));
  return { default: MockRedis };
});
```

**Critical note on vi.mock hoisting:** `vi.mock()` calls are hoisted to the top of the file automatically by Vitest's transform. This means they execute before any imports, which is exactly what we need. However, there is a known issue where `vi.mock` on a module does NOT work if that module is already imported in the setup file itself. The setup file must only contain `vi.mock()` calls and not import the mocked modules.

### Pattern 2: Test Database Helper

**What:** A factory function that creates a fresh in-memory SQLite database with the full production schema.
**When to use:** Any test that needs to interact with the database (repository tests, integration tests).
**Why:** The production `client.ts` runs `initializeDatabase()` at module level, creating tables and running migrations. Tests need the same schema but in memory.

```typescript
// src/__tests__/helpers/test-db.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/infrastructure/database/schema";

/**
 * Create a fresh in-memory SQLite database with production schema.
 *
 * Mirrors the exact migration chain from client.ts:
 * 1. CREATE TABLE photos (base)
 * 2. CREATE TABLE albums (base, no tags)
 * 3. CREATE TABLE photo_albums (junction)
 * 4. CREATE INDEX photo_albums_photo_idx
 * 5. CREATE INDEX photo_albums_album_idx
 * 6. ALTER TABLE photos ADD COLUMN exif_data (Phase 11)
 * 7. ALTER TABLE photos ADD COLUMN width, height (Phase 12)
 * 8. Rebuild albums table with tags + ON DELETE SET NULL FK (Phase 13)
 * 9. PRAGMA foreign_keys = ON
 */
export function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle({ client: sqlite, schema });

  // Base tables
  sqlite.exec(`
    CREATE TABLE photos (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      original_filename TEXT NOT NULL,
      blur_data_url TEXT,
      status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'ready', 'error')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  sqlite.exec(`
    CREATE TABLE albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      cover_photo_id TEXT REFERENCES photos(id),
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  sqlite.exec(`
    CREATE TABLE photo_albums (
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (photo_id, album_id)
    )
  `);

  // Indexes
  sqlite.exec(`CREATE INDEX photo_albums_photo_idx ON photo_albums(photo_id)`);
  sqlite.exec(`CREATE INDEX photo_albums_album_idx ON photo_albums(album_id)`);

  // Migration: exif_data (Phase 11)
  sqlite.exec(`ALTER TABLE photos ADD COLUMN exif_data TEXT`);

  // Migration: width/height (Phase 12)
  sqlite.exec(`ALTER TABLE photos ADD COLUMN width INTEGER`);
  sqlite.exec(`ALTER TABLE photos ADD COLUMN height INTEGER`);

  // Migration: FK fix + tags column (Phase 13)
  // The production migration checks PRAGMA foreign_key_list and rebuilds.
  // On fresh DB, albums FK is NO ACTION (default), so migration always runs.
  // We replicate the final state directly:
  sqlite.exec(`
    ALTER TABLE albums RENAME TO _albums_old;
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
    INSERT INTO albums SELECT id, title, description, NULL, cover_photo_id, sort_order, is_published, created_at FROM _albums_old;
    DROP TABLE _albums_old;
  `);

  // Enable foreign keys
  sqlite.pragma("foreign_keys = ON");

  return { db, sqlite };
}
```

**Critical insight about the `_albums_old` migration:** The INSERT INTO statement in the test helper must account for the fact that in a fresh DB, the original albums table has NO `tags` column, so the INSERT must use `NULL` as the tags value rather than selecting it from `_albums_old`. This differs from the production migration (which copies `tags` from the old table because that table was already rebuilt in a prior run or had the column added).

### Pattern 3: Environment Variable Handling for Tests

**What:** Set required environment variables before the env.ts Zod validation runs.
**When to use:** The `env.ts` module validates env vars at import time and throws if missing.
**Why:** Without setting these, any import chain that touches `env.ts` will crash.

```typescript
// In vitest.config.ts or setup.ts
// Option A: Set in vitest.config.ts via env option
export default defineConfig({
  test: {
    env: {
      DATABASE_PATH: ":memory:",
      STORAGE_PATH: "/tmp/test-storage",
      AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
      ADMIN_PASSWORD_HASH: "$2b$10$test-hash-value-placeholder-here",
      NODE_ENV: "test",
    },
  },
});
```

This is the cleanest approach because `vitest.config.ts` env values are set before any setup files or test files run.

### Pattern 4: Fixture Image Generation

**What:** A script that generates minimal test images with and without EXIF data.
**When to use:** Run once to generate fixture files; commit the files to the repo.
**Why:** Tests need actual image files for Sharp operations, but real photos are too large. Programmatically generated 8x8 pixel images are sufficient and tiny (~1-2KB for JPEG with EXIF).

```typescript
// src/__tests__/fixtures/generate-fixtures.ts
import sharp from "sharp";
import path from "path";

const FIXTURES_DIR = path.resolve(__dirname);

async function generateFixtures() {
  // 1. Tiny landscape JPEG with EXIF data (8x6 pixels)
  await sharp({
    create: {
      width: 8,
      height: 6,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: {
        Make: "TestCamera",
        Model: "TestModel X100",
        ImageDescription: "Test landscape image",
      },
    })
    .toFile(path.join(FIXTURES_DIR, "tiny-landscape.jpg"));

  // 2. Tiny portrait JPEG with EXIF data (6x8 pixels)
  await sharp({
    create: {
      width: 6,
      height: 8,
      channels: 3,
      background: { r: 200, g: 100, b: 100 },
    },
  })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: {
        Make: "AnotherBrand",
        Model: "Pro 50",
      },
    })
    .toFile(path.join(FIXTURES_DIR, "tiny-portrait.jpg"));

  // 3. Tiny PNG without EXIF (8x8 pixels)
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toFile(path.join(FIXTURES_DIR, "tiny-no-exif.png"));
}

generateFixtures().then(() => console.log("Fixtures generated"));
```

### Anti-Patterns to Avoid

- **Mocking `better-sqlite3` globally:** Do NOT mock the database driver. Unlike Redis (which needs a live server), better-sqlite3 works perfectly with `:memory:` databases. Mocking it would make repository tests worthless -- they need to test real SQL execution.

- **Using `drizzle-kit push` for test schema:** This requires async setup, a drizzle config, and may not replicate the exact ALTER TABLE migration chain. Instead, replicate the raw SQL from `initializeDatabase()` directly.

- **Importing mocked modules in the setup file:** Vitest has a known issue where `vi.mock` won't work if the setup file itself imports the mocked module. The setup file should ONLY contain `vi.mock()` calls.

- **Large fixture images committed to repo:** Real photos are megabytes. Generated 8x8 pixel fixtures are 1-2KB. Never commit real test photos.

- **Mocking the `db` singleton for repository tests:** Repositories import `db` from `../client`. For repository tests, you need to mock the module that provides `db` so that the repositories use the test database instance. Use `vi.mock('@/infrastructure/database/client')` in test files that test repositories.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem             | Don't Build                          | Use Instead                        | Why                                                              |
| ------------------- | ------------------------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| Coverage reporting  | Custom coverage scripts              | `@vitest/coverage-v8`              | V8-native, zero source transformation, AST-aware remapping in v4 |
| Module mocking      | Manual module replacement files      | `vi.mock()` with factory functions | Vitest hoists mocks before imports, handles ESM correctly        |
| In-memory SQLite    | Custom database mock objects         | `better-sqlite3` with `':memory:'` | Real SQL execution, same driver as production                    |
| Test image creation | Download stock photos, store in repo | `sharp({ create: ... })`           | Programmatic, reproducible, tiny file sizes                      |
| EXIF test data      | Manually hex-edit EXIF bytes         | `sharp().withExif()`               | Type-safe, readable, creates valid EXIF structure                |

**Key insight:** The test infrastructure should use real implementations where possible (SQLite, Sharp) and only mock what MUST be mocked (Next.js server APIs, Redis connections). This gives the highest confidence that tests reflect production behavior.

## Common Pitfalls

### Pitfall 1: Test Hangs from Unmocked IORedis

**What goes wrong:** Tests import infrastructure code that transitively imports `ioredis`. IORedis attempts TCP connection to `localhost:6379`. If Redis is not running (which it isn't -- no Docker on dev machine), the connection attempt hangs indefinitely, and Vitest never completes.
**Why it happens:** IORedis is imported at module level in `queues.ts` and `rateLimiter.ts`. Module-level `new IORedis(...)` creates a connection immediately.
**How to avoid:** Mock `ioredis` in the setup file BEFORE any test imports. The mock must return a constructor function (since `new IORedis(...)` is called).
**Warning signs:** Tests hang with no output; Vitest process must be killed with Ctrl+C.

### Pitfall 2: server-only Import Crash

**What goes wrong:** `Error: This module cannot be imported from a Client Component module` when importing any auth module.
**Why it happens:** `session.ts`, `password.ts`, and `dal.ts` all have `import "server-only"` at the top. The `server-only` package throws at import time if it detects a non-server context (which Vitest is).
**How to avoid:** `vi.mock('server-only', () => ({}))` in the setup file.
**Warning signs:** Immediate crash on first test file that imports any auth code.

### Pitfall 3: Environment Variable Validation Crash

**What goes wrong:** `Error: Invalid environment variables` when importing any module that depends on `@/infrastructure/config/env`.
**Why it happens:** `env.ts` runs `envSchema.safeParse(process.env)` at module level. In test environment, `DATABASE_PATH`, `STORAGE_PATH`, `AUTH_SECRET`, and `ADMIN_PASSWORD_HASH` are not set.
**How to avoid:** Set all required env vars in `vitest.config.ts` via the `test.env` option. This ensures they are available before ANY module loads.
**Warning signs:** Crash mentioning "DATABASE_PATH is required" or "AUTH_SECRET must be at least 32 characters".

### Pitfall 4: Database Schema Drift Between Test and Production

**What goes wrong:** Test database has different columns or constraints than production, causing tests to pass but production to fail (or vice versa).
**Why it happens:** The production schema evolves through ALTER TABLE migrations in `client.ts`. If the test helper doesn't replicate the exact migration chain, the schemas diverge.
**How to avoid:** The test DB helper must mirror the EXACT SQL from `initializeDatabase()` in `client.ts`, including all ALTER TABLE migrations and the albums table rebuild.
**Warning signs:** Tests pass but production code fails with "no such column" errors, or tests fail on columns that exist in production.

### Pitfall 5: The `tags` Column Gap in Albums Table

**What goes wrong:** Test DB is created with the initial albums schema (no `tags` column), and the FK migration doesn't run because there's no conditional check, resulting in missing `tags`.
**Why it happens:** The original CREATE TABLE for albums does NOT include `tags`. The `tags` column is only added when the FK migration rebuilds the albums table (Phase 13). On a fresh DB, the FK migration DOES run (because the initial FK is NO ACTION, not SET NULL), so `tags` IS added. But if someone writes the test helper incorrectly by skipping the FK migration logic, `tags` will be missing.
**How to avoid:** In the test helper, always run the full migration chain unconditionally. Do not add conditional checks like in production -- just run every migration step since the test DB is always fresh.
**Warning signs:** "no such column: tags" when querying albums in tests.

### Pitfall 6: coverage.all Removed in Vitest 4

**What goes wrong:** Setting `coverage.all: true` (to include untested files) causes a config error.
**Why it happens:** Vitest 4.x removed `coverage.all` and `coverage.extensions`. Users must now explicitly define `coverage.include` to control which files appear in reports.
**How to avoid:** Use `coverage.include: ['src/infrastructure/**/*.ts']` instead of `coverage.all`.
**Warning signs:** Config validation error mentioning unknown property `all`.

### Pitfall 7: vi.mock Version Mismatch with @vitest/coverage-v8

**What goes wrong:** `@vitest/coverage-v8` crashes or produces incorrect reports.
**Why it happens:** The coverage package version must exactly match the vitest version. Installing a mismatched version causes runtime errors.
**How to avoid:** Install `@vitest/coverage-v8@4.0.18` to match `vitest@4.0.18` exactly.
**Warning signs:** "Cannot find module" or incompatible version errors at test startup.

## Code Examples

### Complete vitest.config.ts

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
    env: {
      DATABASE_PATH: ":memory:",
      STORAGE_PATH: "/tmp/test-storage",
      AUTH_SECRET: "test-secret-key-must-be-at-least-32-chars-long!!",
      ADMIN_PASSWORD_HASH:
        "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVW",
      NODE_ENV: "test",
      REDIS_URL: "redis://localhost:6379",
    },
    coverage: {
      provider: "v8",
      include: ["src/infrastructure/**/*.ts"],
      exclude: [
        "src/infrastructure/jobs/worker.ts",
        "src/infrastructure/jobs/load-env.ts",
      ],
      reporter: ["text", "html", "json"],
      reportsDirectory: "./coverage",
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

### Smoke Test: Next.js Mocks Work

```typescript
// src/infrastructure/__tests__/mocks.smoke.test.ts
import { describe, it, expect } from "vitest";

describe("Next.js mock smoke tests", () => {
  it("can import server-only without crashing", async () => {
    // This would throw "cannot import from Client Component" without mock
    await expect(import("server-only")).resolves.not.toThrow();
  });

  it("can import next/headers and call cookies()", async () => {
    const { cookies } = await import("next/headers");
    const cookieStore = cookies();
    expect(cookieStore.get).toBeDefined();
  });

  it("can import auth session module", async () => {
    // session.ts imports server-only and next/headers
    const mod = await import("@/infrastructure/auth/session");
    expect(mod.encrypt).toBeDefined();
    expect(mod.decrypt).toBeDefined();
  });
});
```

### Smoke Test: Redis Mock Prevents Hangs

```typescript
// src/infrastructure/__tests__/redis.smoke.test.ts
import { describe, it, expect } from "vitest";

describe("Redis mock smoke tests", () => {
  it("can import ioredis without hanging", async () => {
    const IORedis = (await import("ioredis")).default;
    const client = new IORedis();
    expect(client).toBeDefined();
    // Should not hang -- mock returns immediately
  });

  it("can import queues module without hanging", async () => {
    const mod = await import("@/infrastructure/jobs/queues");
    expect(mod.imageQueue).toBeDefined();
  });
});
```

### Smoke Test: In-Memory Database

```typescript
// src/infrastructure/__tests__/test-db.smoke.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "@/tests/helpers/test-db";
import { photos, albums, photoAlbums } from "@/infrastructure/database/schema";

describe("Test database smoke tests", () => {
  it("creates in-memory database with correct schema", () => {
    const { db, sqlite } = createTestDb();

    // Verify photos table has all columns including migrations
    const photoCols = sqlite
      .prepare("PRAGMA table_info(photos)")
      .all() as Array<{ name: string }>;
    const photoColNames = photoCols.map((c) => c.name);
    expect(photoColNames).toContain("id");
    expect(photoColNames).toContain("exif_data"); // Phase 11 migration
    expect(photoColNames).toContain("width"); // Phase 12 migration
    expect(photoColNames).toContain("height"); // Phase 12 migration

    // Verify albums table has tags and correct FK
    const albumCols = sqlite
      .prepare("PRAGMA table_info(albums)")
      .all() as Array<{ name: string }>;
    const albumColNames = albumCols.map((c) => c.name);
    expect(albumColNames).toContain("tags"); // Phase 13 migration

    // Verify FK constraint is SET NULL
    const fks = sqlite
      .prepare("PRAGMA foreign_key_list(albums)")
      .all() as Array<{ from: string; on_delete: string }>;
    const coverFk = fks.find((fk) => fk.from === "cover_photo_id");
    expect(coverFk?.on_delete).toBe("SET NULL");

    sqlite.close();
  });

  it("can insert and query data via Drizzle ORM", () => {
    const { db, sqlite } = createTestDb();

    db.insert(photos)
      .values({
        id: "test-photo-1",
        originalFilename: "test.jpg",
        status: "ready",
      })
      .run();

    const result = db.select().from(photos).all();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("test-photo-1");

    sqlite.close();
  });
});
```

## State of the Art

| Old Approach              | Current Approach           | When Changed | Impact                                                    |
| ------------------------- | -------------------------- | ------------ | --------------------------------------------------------- |
| coverage.all: true        | coverage.include patterns  | Vitest 4.0   | Must explicitly list files to include in coverage reports |
| coverage.extensions       | coverage.include globs     | Vitest 4.0   | File extension filtering via include patterns             |
| coverage.ignoreEmptyLines | Automatic (removed option) | Vitest 4.0   | Empty lines automatically excluded from both providers    |
| `@vitest/browser` imports | `vitest/browser` imports   | Vitest 4.0   | Not relevant for this phase (node environment)            |
| maxThreads/maxForks       | maxWorkers                 | Vitest 4.0   | Simplified pool configuration                             |

**Deprecated/outdated:**

- `coverage.all` - Removed in Vitest 4.0; use `coverage.include` instead
- `coverage.extensions` - Removed in Vitest 4.0; use `coverage.include` with globs
- `coverage.experimentalAstAwareRemapping` - Removed (now always enabled)
- `vite-node` module runner - Replaced with Vite Module Runner in Vitest 4.0

## Open Questions

1. **`react.cache` mock completeness**
   - What we know: `dal.ts` uses `import { cache } from "react"` to wrap `verifySession`. The setup file must mock the `react` module's `cache` export.
   - What's unclear: Whether mocking just `cache` from `react` will interfere with other React imports used elsewhere. In the node test environment without jsdom, React component imports are unlikely, but the mock should be targeted.
   - Recommendation: Mock only `cache` from `react` using a pass-through factory `vi.fn((fn) => fn)`. If issues arise, use `importOriginal` to preserve other React exports.

2. **ADMIN_PASSWORD_HASH test value**
   - What we know: `env.ts` requires `ADMIN_PASSWORD_HASH` to be a non-empty string. For tests, we need a valid-looking bcrypt hash.
   - What's unclear: Whether any test will actually call `bcrypt.compare` against this hash. If so, we need a hash generated from a known password.
   - Recommendation: Use a real bcrypt hash of "test-password" (generate with `npx tsx -e "const b = require('bcrypt'); b.hash('test-password', 10).then(console.log)"`) so that auth tests in Phase 17 can use it.

3. **BullMQ Queue/Worker constructor mocking**
   - What we know: `queues.ts` creates `new Queue(...)` at module level, passing the mocked IORedis connection. BullMQ's Queue constructor may have its own behavior beyond Redis.
   - What's unclear: Whether mocking IORedis alone is sufficient, or whether BullMQ itself needs mocking. The Queue constructor may throw if the connection object doesn't have expected properties.
   - Recommendation: Start with IORedis mock only. If Queue constructor fails, add `vi.mock('bullmq')` to mock the Queue class directly.

## Sources

### Primary (HIGH confidence)

- Vitest official docs - Coverage guide: https://vitest.dev/guide/coverage.html
- Vitest official docs - Coverage config: https://vitest.dev/config/coverage
- Vitest official docs - Module mocking: https://vitest.dev/guide/mocking/modules
- Vitest official docs - Migration to v4: https://vitest.dev/guide/migration.html
- Sharp API - Constructor/create: https://sharp.pixelplumbing.com/api-constructor
- Sharp API - Output/withExif: https://sharp.pixelplumbing.com/api-output
- Next.js official docs - Vitest testing guide: https://nextjs.org/docs/app/guides/testing/vitest
- Project source code: `src/infrastructure/` (all files read directly)

### Secondary (MEDIUM confidence)

- Next.js GitHub issue #60038 - server-only with Vitest workaround: https://github.com/vercel/next.js/issues/60038
- Vitest GitHub issue #1450 - vi.mock in setup files: https://github.com/vitest-dev/vitest/issues/1450
- npm registry - @vitest/coverage-v8 version 4.0.18 availability: https://www.npmjs.com/package/@vitest/coverage-v8

### Tertiary (LOW confidence)

- ioredis-mock as alternative to vi.mock: https://github.com/stipsan/ioredis-mock (not recommended for this use case)
- Drizzle ORM testing discussions: https://github.com/drizzle-team/drizzle-orm/discussions/784 (no definitive patterns)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Vitest 4.0.18 already installed, @vitest/coverage-v8@4.0.18 confirmed available, all dependencies already in project
- Architecture (mocking patterns): HIGH - Verified with Vitest official docs and Next.js GitHub issues; patterns well-established
- Architecture (test DB helper): HIGH - Verified by reading actual `client.ts` migration chain; better-sqlite3 `:memory:` is a documented feature
- Fixture generation: HIGH - Verified `sharp({ create: ... })` and `.withExif()` APIs from official Sharp documentation
- Pitfalls: HIGH - Identified from direct codebase analysis of module-level side effects
- Coverage config: HIGH - Verified Vitest 4.x changes from official migration guide

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable domain; Vitest and Sharp APIs are mature)
