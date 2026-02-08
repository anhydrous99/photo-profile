# Phase 17: Unit & Integration Testing - Research

**Researched:** 2026-02-07
**Domain:** Vitest unit/integration testing for repositories, image services, auth, and API routes
**Confidence:** HIGH

## Summary

Phase 17 writes the actual unit and integration tests that the Phase 15 infrastructure was built to support. The test infrastructure is fully operational: Vitest 4.0.18 with global mocks for Next.js APIs, IORedis, and BullMQ; an in-memory SQLite helper (`createTestDb()`) that replicates the full production migration chain; three fixture images (landscape JPEG with EXIF, portrait JPEG with EXIF, PNG without EXIF); and V8 coverage targeting `src/infrastructure/**/*.ts`. All 75 existing smoke tests pass in ~436ms.

The primary challenge is that both `SQLitePhotoRepository` and `SQLiteAlbumRepository` import `db` from `../client` at module level, which connects to the real filesystem database. To test repositories against the in-memory test database, tests must use `vi.mock('@/infrastructure/database/client')` to replace the `db` export with the test instance. This pattern is already called out in the Phase 15 research as the recommended approach. The repositories themselves are straightforward Drizzle ORM wrappers with `toDomain`/`toDatabase` serialization methods that need thorough edge-case testing.

For auth testing, `encrypt` and `decrypt` from `session.ts` use the `jose` library (v6.1.3) with HS256 JWTs. These functions are pure async functions (given the env `AUTH_SECRET` is already set in vitest.config.ts), making them testable without additional mocking. Testing expiry requires creating tokens with short TTLs or manipulating the encoded expiration claim. For API route testing, the route handlers are standard async functions that accept `Request`/`NextRequest` objects and return `NextResponse`, so they can be called directly by constructing mock request objects -- no HTTP server needed.

**Primary recommendation:** Use `vi.mock('@/infrastructure/database/client')` to inject test DB instances into repository tests. Test auth `encrypt`/`decrypt` directly as pure functions. Test API routes by calling handler functions with constructed `NextRequest` objects and mocked `verifySession`. Test image service with the existing fixture images and a temp output directory.

## Standard Stack

### Core

| Library        | Version | Purpose                                | Why Standard                                                       |
| -------------- | ------- | -------------------------------------- | ------------------------------------------------------------------ |
| vitest         | 4.0.18  | Test runner, assertions, mocking       | Already configured with setup file, globals, coverage              |
| better-sqlite3 | 12.6.2  | In-memory SQLite for repository tests  | Already used via `createTestDb()` helper from Phase 15             |
| drizzle-orm    | 0.45.1  | ORM queries in repository tests        | Same ORM as production; test helper returns typed Drizzle instance |
| sharp          | 0.34.5  | Image service testing with fixtures    | Already installed; fixture images already generated                |
| jose           | 6.1.3   | JWT operations tested directly         | Already installed; `encrypt`/`decrypt` use it for HS256            |
| zod            | ^4.3.6  | Validation schema testing in API tests | Already used in all API routes for request validation              |

### Supporting

| Library     | Version | Purpose                            | When to Use                                         |
| ----------- | ------- | ---------------------------------- | --------------------------------------------------- |
| exif-reader | 2.0.3   | Verify EXIF extraction in tests    | Used by `exifService.ts`; validate extracted fields |
| bcrypt      | ^6.0.0  | Test password hashing/verification | Test `verifyPassword` and `hashPassword` functions  |

### Alternatives Considered

| Instead of                                 | Could Use                     | Tradeoff                                                                          |
| ------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------- |
| Mocking `@/infrastructure/database/client` | Dependency injection refactor | DI is cleaner but requires modifying all repository constructors; mock is simpler |
| Calling API routes directly                | supertest / node-mocks-http   | Extra dependency; Next.js route handlers accept standard Request objects directly |
| Manual JWT creation for expiry tests       | jose `createLocalJWKSet`      | Overcomplicated; direct `jwtVerify` with known expired token is simpler           |

**Installation:**

```bash
# No new packages needed -- all tools are already installed
```

## Architecture Patterns

### Recommended Test File Structure

```
src/
├── __tests__/                              # Test infrastructure (Phase 15 - exists)
│   ├── setup.ts                            # Global mocks (exists)
│   ├── helpers/
│   │   └── test-db.ts                      # In-memory SQLite factory (exists)
│   └── fixtures/
│       ├── tiny-landscape.jpg              # 8x6 JPEG with EXIF (exists)
│       ├── tiny-portrait.jpg               # 6x8 JPEG with EXIF (exists)
│       └── tiny-no-exif.png                # 8x8 PNG, no EXIF (exists)
├── infrastructure/
│   ├── __tests__/                          # Smoke tests (Phase 15 - exist)
│   │   ├── mocks.smoke.test.ts
│   │   ├── test-db.smoke.test.ts
│   │   └── fixtures.smoke.test.ts
│   ├── database/
│   │   └── __tests__/
│   │       ├── photo-repository.test.ts    # UNIT-01, UNIT-02: Photo CRUD + serialization
│   │       └── album-repository.test.ts    # UNIT-01, UNIT-02: Album CRUD + serialization
│   ├── auth/
│   │   └── __tests__/
│   │       └── auth.test.ts                # UNIT-04: JWT session + password verification
│   └── services/
│       └── __tests__/
│           ├── imageService.test.ts        # UNIT-03: Derivative generation
│           └── exifService.test.ts         # UNIT-03: EXIF extraction
├── app/
│   └── api/
│       └── __tests__/
│           ├── admin-photos.test.ts        # UNIT-05: Photo API route tests
│           ├── admin-albums.test.ts        # UNIT-05: Album API route tests
│           └── images.test.ts              # UNIT-05: Image serving route tests
```

### Pattern 1: Repository Testing with Mocked DB Client

**What:** Mock the `@/infrastructure/database/client` module to inject an in-memory test database, then import the repository class which uses the mocked `db`.
**When to use:** All repository integration tests (UNIT-01, UNIT-02).
**Why:** Repositories import `db` from `../client` at module level. The `vi.mock` approach is the only way to replace it without refactoring the repository constructors to accept a `db` parameter.

```typescript
// src/infrastructure/database/__tests__/photo-repository.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb } from "@/__tests__/helpers/test-db";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/infrastructure/database/schema";

// Mock the client module BEFORE importing the repository
let testDb: BetterSQLite3Database<typeof schema>;
let testSqlite: Database.Database;

vi.mock("@/infrastructure/database/client", () => ({
  get db() {
    return testDb;
  },
}));

// Import AFTER mock is declared (vi.mock is hoisted, but the lazy getter
// ensures the correct testDb is used at call time)
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";

describe("SQLitePhotoRepository", () => {
  let repo: SQLitePhotoRepository;

  beforeEach(() => {
    ({ db: testDb, sqlite: testSqlite } = createTestDb());
    repo = new SQLitePhotoRepository();
  });

  afterEach(() => {
    testSqlite.close();
  });

  it("saves and retrieves a photo", async () => {
    const photo = {
      id: "test-id",
      title: "Test Photo",
      description: null,
      originalFilename: "photo.jpg",
      blurDataUrl: null,
      exifData: null,
      width: 1920,
      height: 1080,
      status: "ready" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await repo.save(photo);
    const result = await repo.findById("test-id");

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Test Photo");
    expect(result!.width).toBe(1920);
  });
});
```

**Critical detail: Lazy getter for `db`.** The mock uses `get db()` (a getter) rather than `db: testDb` (a value). This is because `vi.mock` factories run once at module load time, but `testDb` is reassigned in `beforeEach`. A getter ensures the repository always accesses the current test database instance.

### Pattern 2: toDomain/toDatabase Round-Trip Serialization Testing

**What:** Insert a domain object via `save()`, retrieve it via `findById()`, and verify all fields survive the round trip.
**When to use:** UNIT-02 serialization tests, especially edge cases.
**Why:** The repositories have `toDomain()` and `toDatabase()` methods that serialize/deserialize between domain entities and database rows. Several fields have non-trivial transformations: `exifData` is JSON-serialized, `isPublished` is boolean/integer, `createdAt`/`updatedAt` are Date/timestamp_ms.

```typescript
it("round-trips ExifData through JSON serialization", async () => {
  const exifData = {
    cameraMake: "TestCamera",
    cameraModel: "TestModel X100",
    lens: null,
    focalLength: 35,
    aperture: 2.8,
    shutterSpeed: "1/250",
    iso: 400,
    dateTaken: "2024-06-15T10:30:00.000Z",
    whiteBalance: "Auto",
    meteringMode: "Pattern",
    flash: "Did not fire",
  };

  const photo = {
    id: "exif-test",
    title: null,
    description: null,
    originalFilename: "test.jpg",
    blurDataUrl: null,
    exifData,
    width: 1920,
    height: 1080,
    status: "ready" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await repo.save(photo);
  const result = await repo.findById("exif-test");

  expect(result!.exifData).toEqual(exifData);
});

it("handles null EXIF data without error", async () => {
  const photo = makePhoto({ exifData: null });
  await repo.save(photo);
  const result = await repo.findById(photo.id);
  expect(result!.exifData).toBeNull();
});

it("handles Unicode filenames", async () => {
  const photo = makePhoto({
    originalFilename: "foto_\u00e9t\u00e9_\u2603.jpg",
  });
  await repo.save(photo);
  const result = await repo.findById(photo.id);
  expect(result!.originalFilename).toBe("foto_\u00e9t\u00e9_\u2603.jpg");
});

it("handles zero dimensions", async () => {
  const photo = makePhoto({ width: 0, height: 0 });
  await repo.save(photo);
  const result = await repo.findById(photo.id);
  // width/height use `?? null` in toDomain, so 0 should be preserved (not nullified)
  expect(result!.width).toBe(0);
  expect(result!.height).toBe(0);
});
```

**Important edge case: `width: 0` vs `width: null`.** The `toDomain()` method uses `row.width ?? null`. The `??` operator treats `0` as truthy, so `width: 0` should survive the round trip as `0`, not `null`. This is correct behavior but must be explicitly tested.

### Pattern 3: Auth JWT Testing

**What:** Test `encrypt` and `decrypt` functions from `session.ts` directly.
**When to use:** UNIT-04 auth tests.
**Why:** These are pure async functions using `jose` library. The `AUTH_SECRET` env var is already set in vitest.config.ts, so the `encodedKey` used by these functions is deterministic in tests.

```typescript
import { encrypt, decrypt } from "@/infrastructure/auth/session";

describe("Auth session", () => {
  it("encrypt returns a JWT string", async () => {
    const token = await encrypt({
      isAdmin: true,
      expiresAt: new Date(Date.now() + 3600000),
    });
    expect(token).toMatch(/^eyJ/); // JWT always starts with eyJ (base64 header)
    expect(token.split(".")).toHaveLength(3); // header.payload.signature
  });

  it("decrypt verifies a valid token", async () => {
    const payload = {
      isAdmin: true as const,
      expiresAt: new Date(Date.now() + 3600000),
    };
    const token = await encrypt(payload);
    const result = await decrypt(token);
    expect(result).not.toBeNull();
    expect(result!.isAdmin).toBe(true);
  });

  it("decrypt returns null for tampered token", async () => {
    const token = await encrypt({
      isAdmin: true,
      expiresAt: new Date(Date.now() + 3600000),
    });
    const tampered = token.slice(0, -5) + "XXXXX";
    const result = await decrypt(tampered);
    expect(result).toBeNull();
  });

  it("decrypt returns null for expired token", async () => {
    // Create token with jose directly using a very short expiry
    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode(
      "test-secret-key-must-be-at-least-32-chars-long!!",
    );
    const token = await new SignJWT({ isAdmin: true })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("0s") // Already expired
      .sign(key);

    const result = await decrypt(token);
    expect(result).toBeNull();
  });
});
```

**Note on expired token testing:** The `encrypt` function hardcodes `"8h"` expiry. To test expiry rejection, we cannot use `encrypt` directly (we would need to wait 8 hours). Instead, create a token with `jose` directly using `"0s"` or past expiration, then pass it to `decrypt`. This tests that `decrypt` correctly rejects expired tokens.

### Pattern 4: API Route Testing Without HTTP Server

**What:** Import route handler functions directly and call them with constructed `NextRequest` objects.
**When to use:** UNIT-05 API integration tests.
**Why:** Next.js App Router route handlers are plain async functions. They accept `Request` (or `NextRequest`) and return `Response` (or `NextResponse`). No HTTP server is needed.

```typescript
import { vi } from "vitest";

// Mock verifySession to control auth state
vi.mock("@/infrastructure/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/auth")>();
  return {
    ...actual,
    verifySession: vi.fn(),
  };
});

// Mock storage to prevent filesystem operations
vi.mock("@/infrastructure/storage", () => ({
  deletePhotoFiles: vi.fn(),
  saveOriginalFile: vi.fn(),
}));

import { verifySession } from "@/infrastructure/auth";
import { PATCH, DELETE } from "@/app/api/admin/photos/[id]/route";
import { NextRequest } from "next/server";

describe("PATCH /api/admin/photos/[id]", () => {
  beforeEach(() => {
    vi.mocked(verifySession).mockResolvedValue({ isAuth: true });
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(verifySession).mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/admin/photos/test-id", {
      method: "PATCH",
      body: JSON.stringify({ description: "new" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: "test-id" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    // ... repo must have a photo to get past the 404 check
    const req = new NextRequest("http://localhost/api/admin/photos/test-id", {
      method: "PATCH",
      body: JSON.stringify({ invalid: "field" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: "test-id" }),
    });
    // Returns 400 OR 404 depending on whether photo exists
    expect([400, 404]).toContain(res.status);
  });
});
```

**Critical detail: `params` is a Promise.** In Next.js 16, route params are async (`params: Promise<{ id: string }>`). Test code must wrap params in `Promise.resolve()`.

### Pattern 5: Image Service Testing with Temp Directories

**What:** Call `generateDerivatives` and `generateBlurPlaceholder` with fixture images and a temporary output directory.
**When to use:** UNIT-03 image service tests.
**Why:** These functions perform real Sharp operations. Using the tiny fixture images (8x6 pixels) keeps tests fast while verifying the full pipeline.

```typescript
import {
  generateDerivatives,
  generateBlurPlaceholder,
  THUMBNAIL_SIZES,
} from "@/infrastructure/services/imageService";
import { mkdtemp, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

describe("imageService", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "test-derivatives-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("generates WebP and AVIF derivatives for sizes smaller than original", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "src/__tests__/fixtures/tiny-landscape.jpg",
    );
    const paths = await generateDerivatives(fixturePath, outputDir);

    // 8x6 image: only 300 and 600 are skipped (8 < 300), so actually
    // the 8px image is smaller than ALL thumbnail sizes (300, 600, 1200, 2400)
    // This means NO derivatives should be generated
    expect(paths).toHaveLength(0);
  });
});
```

**Critical insight: The fixture images are tiny (8x6 pixels).** Since `THUMBNAIL_SIZES = [300, 600, 1200, 2400]` and the fixture is only 8 pixels wide, `generateDerivatives` will skip ALL sizes (no upscaling). To test actual derivative generation, we need a fixture that is at least 300px wide, OR we need to create a larger test image on-the-fly in the test setup.

### Anti-Patterns to Avoid

- **Mocking the Drizzle ORM query builder:** Never mock `db.select().from().where()` etc. The entire point of repository integration tests is to run real SQL against a real SQLite database. Mock only the `client` module to swap which database instance is used.

- **Testing API routes with fetch/supertest:** API route handlers are plain functions. Calling them directly is faster, simpler, and avoids network overhead. Constructing `NextRequest` is straightforward.

- **Hardcoding test data UUIDs that conflict:** Each test should use unique IDs. Use a helper function or incrementing counter to avoid primary key collisions between tests.

- **Forgetting to close the SQLite database in afterEach:** The in-memory database must be closed after each test to prevent memory leaks and ensure test isolation. Always call `sqlite.close()` in `afterEach`.

- **Testing `verifySession` (DAL) with real cookies:** The DAL function reads cookies from `next/headers`, which is mocked. For API route tests, mock `verifySession` directly instead of trying to set up cookie state.

## Don't Hand-Roll

| Problem                        | Don't Build                      | Use Instead                                       | Why                                                                     |
| ------------------------------ | -------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Test database instances        | Custom SQLite mock objects       | `createTestDb()` helper (exists)                  | Already replicates full migration chain; returns typed Drizzle db       |
| Mock HTTP requests             | Manual Request construction      | `new NextRequest(url, init)`                      | Standard Web API; NextRequest extends Request with Next.js extras       |
| Expired JWT tokens for testing | Sleeping/waiting for real expiry | Create token with `jose` directly                 | Use `setExpirationTime("0s")` for immediately-expired tokens            |
| Larger fixture images          | Download real photos             | `sharp({ create: { width: 400 } })`               | Generate programmatically in beforeAll; keeps test suite self-contained |
| API auth state                 | Real cookie/session setup        | `vi.mocked(verifySession).mockResolvedValue(...)` | Direct mock is simpler and more explicit than cookie manipulation       |

**Key insight:** The test infrastructure from Phase 15 handles most of the hard problems (mocking, DB setup, fixtures). Phase 17 primarily needs to call existing helpers correctly and write the actual assertions.

## Common Pitfalls

### Pitfall 1: Repository Tests Using Stale DB Reference

**What goes wrong:** Tests import the repository module, but the mock's `db` reference points to a stale or closed database from a previous test.
**Why it happens:** `vi.mock` factory runs once. If you assign `db: testDb` as a value in the factory, it captures the initial `testDb` reference (which is `undefined` before `beforeEach` runs).
**How to avoid:** Use a getter function in the mock factory: `get db() { return testDb; }`. This ensures every `db` access reads the current value of `testDb`, which is reassigned in `beforeEach`.
**Warning signs:** "database is closed" or "database is not open" errors in repository tests after the first test.

### Pitfall 2: Tiny Fixtures Too Small for Derivative Generation

**What goes wrong:** `generateDerivatives` produces zero output files because all thumbnail sizes (300, 600, 1200, 2400) exceed the fixture's 8-pixel width.
**Why it happens:** The no-upscaling guard `if (originalWidth < width) continue` correctly skips oversized targets. The 8x6 fixture images are smaller than ALL targets.
**How to avoid:** For UNIT-03 derivative generation tests, create a test-specific larger image (e.g., 400x300 pixels) using `sharp({ create: { width: 400, height: 300 } })` in `beforeAll`. This will generate derivatives at the 300px tier. Alternatively, test the no-derivatives-generated case separately as valid behavior.
**Warning signs:** Test expects derivative files but finds zero; assertion on `paths.length > 0` fails.

### Pitfall 3: API Route Params Must Be Promises

**What goes wrong:** Route handler crashes with "params.then is not a function" or similar.
**Why it happens:** Next.js 16 changed route params from sync objects to `Promise<{ id: string }>`. The route handlers `await params` internally.
**How to avoid:** Always wrap params in `Promise.resolve()`: `{ params: Promise.resolve({ id: "test-id" }) }`.
**Warning signs:** TypeError when calling route handlers in tests.

### Pitfall 4: Module-Level Repository Instantiation in API Routes

**What goes wrong:** API routes instantiate `new SQLitePhotoRepository()` at module level (outside the handler function). If the `client` module mock hasn't been set up when the API route module loads, the repository connects to the wrong DB.
**Why it happens:** Several API routes have `const photoRepository = new SQLitePhotoRepository()` at the top of the file, outside any function.
**How to avoid:** For API route tests that need a real DB (integration-style), mock the `client` module the same way as repository tests. For API route tests focused on auth/validation, mock the entire repository module instead.
**Warning signs:** API route tests pass for auth checks but fail when trying to query data; or queries hit an unexpected database.

### Pitfall 5: Timestamp Comparison Precision

**What goes wrong:** `expect(result.createdAt).toEqual(photo.createdAt)` fails even though dates look the same.
**Why it happens:** SQLite stores timestamps as integer milliseconds. The round-trip through `timestamp_ms` mode may lose sub-millisecond precision, or the `Date` objects may differ by reference even with the same time value.
**How to avoid:** Compare timestamps using `.getTime()`: `expect(result.createdAt.getTime()).toBe(photo.createdAt.getTime())`. Or use `toBeCloseTo` for sub-second tolerance.
**Warning signs:** "Expected Date(2024-...) to equal Date(2024-...)" where the dates appear identical.

### Pitfall 6: ExifData `safeParseExifJson` Swallows Errors Silently

**What goes wrong:** Tests don't notice that corrupt EXIF JSON is being silently handled (returns null instead of throwing).
**Why it happens:** The `safeParseExifJson` method catches all JSON.parse errors and returns null. This is correct behavior (Phase 16 ERR-07), but tests must explicitly verify it.
**How to avoid:** Write a specific test that inserts a row with invalid JSON in the exif_data column (using raw SQL) and verifies `toDomain` returns `exifData: null` without throwing.
**Warning signs:** Missing test coverage for the error path in `safeParseExifJson`.

### Pitfall 7: isPublished Boolean/Integer Mismatch

**What goes wrong:** `isPublished` comes back as `0` or `1` instead of `true` or `false`.
**Why it happens:** SQLite stores booleans as integers. Drizzle's `mode: "boolean"` on the column should handle the conversion, but if the test database schema uses raw SQL `INTEGER` without Drizzle's mode, the conversion may not apply.
**How to avoid:** The `createTestDb()` helper creates a raw SQL schema (not via Drizzle DDL), but passes the Drizzle `schema` object to `drizzle()`. Drizzle's type system handles the boolean conversion at query time as long as the `schema` import is correct. Verify with explicit assertions: `expect(typeof result.isPublished).toBe("boolean")`.
**Warning signs:** Type assertion failures or strict equality comparisons failing (`true !== 1`).

## Code Examples

### Helper: Make Photo Factory Function

A utility to create Photo domain objects with sensible defaults, overridable per-test.

```typescript
// Can be placed in test file or in a shared test helper
import type { Photo } from "@/domain/entities/Photo";

let photoCounter = 0;

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  photoCounter++;
  return {
    id: `test-photo-${photoCounter}`,
    title: null,
    description: null,
    originalFilename: "test.jpg",
    blurDataUrl: null,
    exifData: null,
    width: null,
    height: null,
    status: "ready",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}
```

### Helper: Make Album Factory Function

```typescript
import type { Album } from "@/domain/entities/Album";

let albumCounter = 0;

function makeAlbum(overrides: Partial<Album> = {}): Album {
  albumCounter++;
  return {
    id: `test-album-${albumCounter}`,
    title: `Test Album ${albumCounter}`,
    description: null,
    tags: null,
    coverPhotoId: null,
    sortOrder: 0,
    isPublished: false,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}
```

### Corrupt EXIF JSON Test via Raw SQL

```typescript
it("returns null exifData for corrupt JSON in database", async () => {
  // Insert row with invalid JSON directly via SQLite (bypass Drizzle)
  testSqlite.exec(`
    INSERT INTO photos (id, original_filename, status, exif_data, created_at, updated_at)
    VALUES ('corrupt-exif', 'test.jpg', 'ready', '{invalid json!!!',
            ${Date.now()}, ${Date.now()})
  `);

  const result = await repo.findById("corrupt-exif");
  expect(result).not.toBeNull();
  expect(result!.exifData).toBeNull(); // safeParseExifJson returns null
});
```

### Creating Larger Fixture for Derivative Tests

```typescript
import sharp from "sharp";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

describe("generateDerivatives", () => {
  let largeFixturePath: string;
  let outputDir: string;

  beforeAll(async () => {
    // Create a 400x300 image large enough for the 300px derivative tier
    const tempDir = await mkdtemp(path.join(tmpdir(), "test-fixtures-"));
    largeFixturePath = path.join(tempDir, "test-large.jpg");
    await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .jpeg({ quality: 80 })
      .toFile(largeFixturePath);
  });

  it("generates WebP and AVIF at 300w for a 400px-wide image", async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "test-derivatives-"));
    const paths = await generateDerivatives(largeFixturePath, outputDir);

    // 400px wide: only 300 fits (600, 1200, 2400 skipped)
    expect(paths).toHaveLength(2); // 300w.webp + 300w.avif

    const files = await readdir(outputDir);
    expect(files).toContain("300w.webp");
    expect(files).toContain("300w.avif");
  });
});
```

### API Route Auth Test Pattern

```typescript
import { NextRequest } from "next/server";
import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock auth module
vi.mock("@/infrastructure/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/auth")>();
  return {
    ...actual,
    verifySession: vi.fn(),
  };
});

// Mock storage to prevent filesystem operations
vi.mock("@/infrastructure/storage", () => ({
  deletePhotoFiles: vi.fn().mockResolvedValue(undefined),
  saveOriginalFile: vi.fn().mockResolvedValue("/tmp/test/original.jpg"),
}));

// Mock jobs to prevent Redis operations
vi.mock("@/infrastructure/jobs", () => ({
  enqueueImageProcessing: vi.fn().mockResolvedValue("job-id"),
}));

import { verifySession } from "@/infrastructure/auth";

function makeJsonRequest(
  url: string,
  method: string,
  body?: unknown,
): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }
      : {}),
  });
}

describe("Admin API auth checks", () => {
  it("all admin endpoints return 401 when unauthenticated", async () => {
    vi.mocked(verifySession).mockResolvedValue(null);

    // Import route handlers
    const { POST: createAlbum } = await import("@/app/api/admin/albums/route");
    const req = makeJsonRequest("http://localhost/api/admin/albums", "POST", {
      title: "Test",
    });

    const res = await createAlbum(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });
});
```

## State of the Art

| Old Approach                    | Current Approach             | When Changed | Impact                                                       |
| ------------------------------- | ---------------------------- | ------------ | ------------------------------------------------------------ |
| Testing route handlers via HTTP | Direct function calls        | Next.js 13+  | No supertest needed; construct Request objects directly      |
| `jest.mock()` with `__mocks__`  | `vi.mock()` with factory fns | Vitest 1.0+  | Hoisted before imports; cleaner than manual `__mocks__` dirs |
| Route params as sync objects    | Route params as Promises     | Next.js 15+  | Must wrap test params in `Promise.resolve()`                 |
| `z.flattenError()` standalone   | `z.flattenError()` (Zod v4)  | Zod 4.x      | `.flatten()` on ZodError deprecated; use standalone fn       |

**Deprecated/outdated:**

- `ZodError.flatten()` instance method - Deprecated in Zod v4; use `z.flattenError(error)` instead (already used in production code)

## Open Questions

1. **Repository test isolation vs. performance trade-off**
   - What we know: `createTestDb()` creates a full in-memory SQLite with migration chain. Creating one per test in `beforeEach` ensures isolation.
   - What's unclear: Whether creating ~30+ database instances across all repository tests will be slow. The existing smoke tests create 5 instances and take ~6ms total, suggesting this is not a concern.
   - Recommendation: Create fresh DB per test (`beforeEach`) for full isolation. If tests become slow (>5 seconds total), consider using `beforeAll` with transaction rollback between tests.

2. **API route tests: mock repository vs. real DB**
   - What we know: API routes instantiate repositories at module level. Testing auth/validation only needs mocked repos. Testing full request flow needs real DB.
   - What's unclear: Whether both levels of testing are needed for UNIT-05, or if one approach suffices.
   - Recommendation: Use mocked repositories for API route tests (UNIT-05 focuses on "request validation, auth checks, and error responses"). If a specific route's business logic is complex enough to warrant real DB testing, add it as a separate integration-level test.

3. **ADMIN_PASSWORD_HASH for `verifyPassword` tests**
   - What we know: The vitest.config.ts sets `ADMIN_PASSWORD_HASH` to a placeholder string `$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVW`. This is NOT a valid bcrypt hash of any known password.
   - What's unclear: If auth tests need to call `verifyPassword`, they need a real bcrypt hash.
   - Recommendation: For `verifyPassword` tests, generate a real bcrypt hash of a known test password at the start of the test using `hashPassword("test-password")`, then verify against it. This avoids depending on the env var hash. For `hashPassword` tests, simply verify the output matches bcrypt format.

## Sources

### Primary (HIGH confidence)

- Project source code: All repository, auth, service, and API route files read directly from `src/`
- Vitest 4.0.18 documentation: Module mocking patterns verified against existing working setup
- Phase 15 research and implementation: Test infrastructure verified working (75/75 tests pass)
- Phase 16 implementation: Error handling patterns verified in production code

### Secondary (MEDIUM confidence)

- Next.js 16 route handler patterns: Verified from actual route files in the project (params as Promise, NextRequest/NextResponse usage)
- jose v6 JWT API: Verified from auth/session.ts implementation (SignJWT, jwtVerify, HS256)
- Sharp API (create, resize, webp, avif, toFile): Verified from imageService.ts implementation

### Tertiary (LOW confidence)

- Vitest vi.mock with getter pattern for dynamic injection: Based on understanding of JavaScript getter semantics and vi.mock hoisting behavior. The smoke tests already demonstrate vi.mock works correctly with the existing setup. The getter pattern for dynamic db injection should work but needs validation during implementation.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All tools already installed and configured; no new dependencies needed
- Architecture (repository tests): HIGH - Pattern verified against existing code structure; `vi.mock` approach called out in Phase 15 research
- Architecture (auth tests): HIGH - `encrypt`/`decrypt` are pure async functions; jose API verified from production code
- Architecture (API route tests): HIGH - Route handlers are plain functions accepting Request objects; pattern verified from code
- Architecture (image service tests): MEDIUM - Fixture image dimensions (8px) are too small for derivative generation; need runtime larger image creation
- Pitfalls: HIGH - Identified from direct code analysis of all target modules

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable domain; testing patterns are mature and codebase is well-understood)
