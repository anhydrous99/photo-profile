# Learnings — S3 Storage Migration

> Conventions, patterns, and wisdom discovered during execution.

---

## Task 1: StorageAdapter Interface Definition

### Pattern: Pure Interface (No Implementation)

- Followed `src/domain/repositories/PhotoRepository.ts` pattern
- Interface is zero-dependency, lives in `infrastructure/storage/types.ts`
- All methods are async to support both local and remote backends

### Method Signatures (6 total)

1. `saveFile(key, data, contentType): Promise<void>` — Upload/write
2. `getFile(key): Promise<Buffer>` — Full file retrieval
3. `getFileStream(key): Promise<ReadableStream>` — Streaming (large files)
4. `deleteFiles(prefix): Promise<void>` — Cascade delete by prefix
5. `fileExists(key): Promise<boolean>` — Existence check
6. `listFiles(prefix): Promise<string[]>` — Prefix-based listing

### Key Design Decisions

- **Prefix-based operations** (`deleteFiles`, `listFiles`) enable efficient batch operations for photo cascades
- **Separate `getFile` and `getFileStream`** allows implementations to optimize for small vs large files
- **contentType parameter** in `saveFile` enables S3 metadata and proper MIME handling
- **ReadableStream return type** for streaming avoids memory overhead on large images

### Testing Approach

- TDD: RED → GREEN → REFACTOR
- Test file: `src/infrastructure/storage/__tests__/types.test.ts`
- Two test cases:
  1. Interface shape verification (compile-time + runtime)
  2. Return type enforcement (Promise validation)
- All tests pass ✓

### JSDoc Documentation

- Added comprehensive JSDoc for each method
- Included `@param`, `@returns`, `@throws` tags
- Examples in param descriptions (e.g., "originals/photo-id/original.jpg")
- Explains use cases (e.g., "cascade deletion", "large files")

## Task 3: AWS SDK Dependencies Installation

### Installation Summary

- **Command**: `npm install @aws-sdk/client-s3 @aws-sdk/lib-storage`
- **@aws-sdk/client-s3**: v3.985.0 (S3 client and command classes)
- **@aws-sdk/lib-storage**: v3.985.0 (Multipart upload helper for large files)
- **Total packages added**: 108 (includes transitive dependencies)

### Verification Results

✓ **npm run typecheck**: Passed (no type errors)
✓ **npm run build**: Passed (production build successful)

- Build time: 6.0s compilation + 193.0ms static generation
- All 11 routes compiled successfully
- No import side-effects from AWS SDK packages

### Package Dependencies

- `@aws-sdk/lib-storage` depends on `@aws-sdk/client-s3` (deduped in node_modules)
- Both packages are production dependencies (not dev)
- No breaking changes or version conflicts

### Next Steps

- Ready for S3 service implementation (Task 4)
- Ready for S3 repository implementation (Task 5)
- AWS SDK is now available for import in infrastructure layer

## Task 5: FilesystemStorageAdapter Implementation

### Implementation Pattern

- Class wraps existing `fileStorage.ts` logic into `StorageAdapter` interface
- File: `src/infrastructure/storage/filesystemStorageAdapter.ts` (~75 LOC)
- Uses `env.STORAGE_PATH` as base directory, resolves all keys relative to it

### Key Mapping (fileStorage.ts → StorageAdapter)

| Original Function  | Adapter Method                     | Notes                                                          |
| ------------------ | ---------------------------------- | -------------------------------------------------------------- |
| `saveOriginalFile` | `saveFile(key, data, contentType)` | `mkdir -p` + `writeFile`, contentType unused for filesystem    |
| `findOriginalFile` | `listFiles(prefix)`                | Returns relative keys, not absolute paths                      |
| `deletePhotoFiles` | `deleteFiles(prefix)`              | `rm -rf` with `force: true` (no-op if missing)                 |
| — (new)            | `getFile(key)`                     | `readFile` returning Buffer                                    |
| — (new)            | `getFileStream(key)`               | `createReadStream` → `Readable.toWeb()` for Web ReadableStream |
| — (new)            | `fileExists(key)`                  | `access()` check, returns boolean                              |

### UUID Validation Strategy

- Extracted `validatePhotoKeyIfApplicable()` helper function
- Only validates keys starting with `originals/` or `processed/` prefixes
- Extracts photoId segment (second path component) and runs `assertValidUUID`
- Non-photo keys (e.g., `temp/file.txt`) skip validation — enables general-purpose use

### Node.js Stream Conversion

- `Readable.toWeb(nodeStream)` converts Node.js ReadableStream to Web API ReadableStream
- Cast as `ReadableStream` needed since `Readable.toWeb()` returns `webStream.ReadableStream`

### Testing Approach

- 22 tests using real filesystem (temp directories via `mkdtemp`)
- Mock only `env.STORAGE_PATH` via `vi.mock` with dynamic getter
- Test categories: CRUD operations, stream reading, UUID validation, edge cases
- Gotcha: test keys in `originals/` or `processed/` paths MUST use valid UUIDs

### Pre-existing Issues

- `npm run typecheck` has pre-existing errors in `imageProcessor.ts` (unrelated to this change)
- Verified by stashing changes and running typecheck on clean `main`

## Task 4: S3StorageAdapter Implementation

### Architecture

- `s3Client.ts`: Shared singleton S3Client, reads region from `env.AWS_REGION`
- `s3StorageAdapter.ts`: Class implementing `StorageAdapter` with 6 methods (~160 LOC)
- Bucket name read from `env.AWS_S3_BUCKET` in constructor (non-null assertion — validated by Zod superRefine)

### S3 Command Mapping

| Method          | S3 Commands Used                                | Notes                                                   |
| --------------- | ----------------------------------------------- | ------------------------------------------------------- |
| `saveFile`      | `PutObjectCommand`                              | Sets ContentType on every upload                        |
| `getFile`       | `GetObjectCommand`                              | AbortController timeout (30s), `transformToByteArray()` |
| `getFileStream` | `GetObjectCommand`                              | `transformToWebStream()` cast to `ReadableStream`       |
| `deleteFiles`   | `ListObjectsV2Command` + `DeleteObjectsCommand` | Paginated, `Quiet: true` on delete                      |
| `fileExists`    | `HeadObjectCommand`                             | Catches `NotFound` + `NoSuchKey` → `false`              |
| `listFiles`     | `ListObjectsV2Command`                          | Paginated, filters out undefined keys                   |

### Error Handling

- `NoSuchKey` errors in `getFile`/`getFileStream` → rethrown as `"File not found: {key}"`
- `NotFound` + `NoSuchKey` in `fileExists` → returns `false` (no throw)
- All other errors propagate unchanged
- Helper function `isS3Error()` checks `error.name` against expected S3 error names

### Testing: Mocking AWS SDK v3 in Vitest

- **Critical**: `vi.mock` factories are hoisted — must use `vi.hoisted()` for shared refs
- **Critical**: S3 Commands are classes invoked with `new` — cannot use `vi.fn()` arrow functions
- **Solution**: Define mock classes in `vi.mock` factory (e.g., `class MockPutObjectCommand { constructor(public input) {} }`)
- **Assertion pattern**: Check `sentCommand(n)` via `mockSend.mock.calls[n][0]`, then `instanceof` + `.input` comparison
- AbortController tested by checking `mockSend.mock.calls[0][1].abortSignal` existence
- 22 tests covering all 6 methods + edge cases (pagination, empty responses, error propagation)

## Task 6: Storage Factory + Barrel Exports + Backward-Compatible Wrappers

### Factory Pattern

- `factory.ts` exports `getStorageAdapter()` (singleton) and `getImageUrl()`
- Singleton uses module-level `let instance: StorageAdapter | null` — lazy initialization
- `resetStorageAdapter()` exported for test cleanup between tests
- Factory branches on `env.STORAGE_BACKEND`: `"s3"` → `S3StorageAdapter`, else → `FilesystemStorageAdapter`

### Backward Compatibility Strategy

- `index.ts` re-exports `saveOriginalFile`, `findOriginalFile`, `deletePhotoFiles` as functions (not from fileStorage.ts anymore)
- These are now thin wrappers that call `getStorageAdapter()` internally
- Existing test mocks (`vi.mock("@/infrastructure/storage", ...)`) continue to work — they mock the barrel, not the implementation
- All 286 tests pass, including `admin-photos.test.ts` which mocks `deletePhotoFiles` and `saveOriginalFile`

### Return Value Change: saveOriginalFile

- **Before**: returned absolute filesystem path (e.g., `/storage/originals/{id}/original.jpg`)
- **After**: returns storage key (e.g., `originals/{id}/original.jpg`)
- This aligns with `enqueueImageProcessing(photoId, originalKey)` — the param was already named `originalKey`
- Worker migration (later task) will need to use the adapter to resolve keys to readable paths

### getImageUrl(photoId, filename)

- S3 mode: `https://{AWS_CLOUDFRONT_DOMAIN}/processed/{photoId}/{filename}`
- Filesystem mode: `/api/images/{photoId}/{filename}`
- Used by presentation components (Task 11) for CDN-aware image URLs

### Files Changed

- **Created**: `src/infrastructure/storage/factory.ts` (~25 LOC)
- **Created**: `src/infrastructure/storage/__tests__/factory.test.ts` (7 tests)
- **Rewritten**: `src/infrastructure/storage/index.ts` (wrappers + re-exports)
- **Deleted**: `src/infrastructure/storage/fileStorage.ts` (logic absorbed by adapters + wrappers)

### Testing: Mock Adapters for Factory Tests

- Used `vi.mock()` to replace both adapter classes with lightweight mocks containing `_type` marker
- Used `toHaveProperty("_type", "filesystem")` to avoid TypeScript type assertion issues
- `vi.hoisted()` for shared mock env (critical — documented in Task 4 learnings)

## Task 10: Image Serving Route — Storage Adapter Migration

### Refactoring Summary

- Replaced `readFile`/`readdir`/`stat` from `fs/promises` → `adapter.getFile()`/`adapter.listFiles()`
- Removed `import { join } from "path"` and `import { env } from "@/infrastructure/config/env"` — no longer needed
- Added `import { getStorageAdapter } from "@/infrastructure/storage"`

### ETag Strategy Change

- **Before**: `generateETag(mtimeMs, size)` — used filesystem mtime + file size (not portable to S3)
- **After**: `generateContentETag(buffer)` — MD5 hash of actual file content (works with any storage backend)
- Both use truncated MD5 (16 hex chars) wrapped in quotes for HTTP ETag format
- Trade-off: Now must read file before checking ETag (no stat-only shortcut). Acceptable since images are small derivatives (≤2400px)

### Error Detection Pattern Change

- **Before**: Checked `(error as NodeJS.ErrnoException).code === "ENOENT"` (filesystem-specific)
- **After**: `isFileNotFoundError()` checks `error.message.startsWith("File not found")` (adapter convention)
- Both `FilesystemStorageAdapter` and `S3StorageAdapter` throw errors with "File not found: {key}" prefix

### findLargestDerivative Changes

- **Before**: `readdir(photoDir)` returns filenames (e.g., `["300w.webp", "600w.webp"]`)
- **After**: `adapter.listFiles(prefix)` returns full keys (e.g., `["processed/{id}/300w.webp", ...]`)
- Must extract filename from key using `k.split("/").pop()` before regex matching
- Returns full key (not just filename) since `serveImage` now takes a key, not a file path

### TypeScript: Buffer → NextResponse Body

- `new NextResponse(buffer)` fails TypeScript — Buffer not assignable to `BodyInit`
- Fix: `new NextResponse(new Uint8Array(fileBuffer))` — Uint8Array is valid BodyInit
- Buffer extends Uint8Array so the conversion is zero-copy

### Testing Pattern

- 24 tests covering: validation (8), serving (3), ETag/caching (5), fallback (6), errors (2)
- Mock `getStorageAdapter` to return object with `getFile`/`listFiles` vi.fn() stubs
- Mock `logger` to prevent console noise during error tests
- `generateExpectedETag()` helper mirrors production logic for deterministic assertions
- TDD: 14 tests failed in RED phase → all 24 pass in GREEN phase

## Task 9: API Routes Storage Adapter Verification

### Routes Already Correct (No Changes Needed)

All 4 routes were already using storage adapter convenience wrappers from Task 6:

- **Upload** (`upload/route.ts`): `saveOriginalFile(photoId, file)` → returns storage key → passed to `enqueueImageProcessing`
- **Photo delete** (`photos/[id]/route.ts`): `deletePhotoFiles(id)` → adapter handles dispatch
- **Reprocess** (`photos/[id]/reprocess/route.ts`): `findOriginalFile(id)` → returns storage key → passed to `enqueueImageProcessing`
- **Album delete** (`albums/[id]/route.ts`): `deletePhotoFiles(photoId)` per photo in cascade loop

### Test Updates

1. **Mock return values updated**: `saveOriginalFile` mock now returns storage key format (`originals/{photoId}/original.jpg`) instead of filesystem path (`/tmp/test/original.jpg`)
2. **Added `findOriginalFile` mock** to storage mock (needed for reprocess route tests)
3. **Added `imageQueue.getJob` mock** to jobs mock (reprocess route removes old job before re-enqueue)

### New Tests Added (admin-photos.test.ts): +11 tests

- Upload route: auth, no file, invalid type, saveOriginalFile called, storage key passed to enqueue
- Reprocess route: auth, not found, already processed, original not found, findOriginalFile + enqueue verified, stale processing photos

### New Tests Added (admin-albums.test.ts): +2 tests

- `deletePhotoFiles` called per photo on cascade delete
- `deletePhotoFiles` NOT called when `deletePhotos: false`

### Testing Gotchas

- **File reference equality**: `FormData` creates a copy of the `File` object. Use `expect.any(File)` instead of direct reference comparison when asserting `saveOriginalFile` args.
- **Mock call leaking**: `vi.restoreAllMocks()` restores implementations but does NOT clear accumulated call counts from `vi.mock()` factory mocks. Use `vi.clearAllMocks()` in `beforeEach` when asserting call counts.

## Task 8: Worker Refactor for S3 Download→Process→Upload Flow

### Architecture Change

- Worker no longer reads/writes directly to `env.STORAGE_PATH`
- Flow: `adapter.getFile(originalKey)` → temp dir → Sharp → `adapter.saveFile()` per derivative → cleanup
- Temp directory pattern: `/tmp/photo-worker-{photoId}-{attemptsMade}/`
- `attemptsMade` (not job ID) ensures unique temp dir per retry attempt (idempotent retries)

### Key Implementation Details

| Step               | Before                                              | After                                                        |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------ |
| Input path         | `originalKey` (direct filesystem path)              | Download via `adapter.getFile(originalKey)` → write to temp  |
| Output dir         | `path.join(env.STORAGE_PATH, "processed", photoId)` | Temp dir (`/tmp/photo-worker-{photoId}-{attempt}/`)          |
| Derivative storage | Written directly to final location by Sharp         | Read from temp, uploaded via `adapter.saveFile()`            |
| Cleanup            | None needed (files in final location)               | `rm(tempDir, { recursive: true, force: true })` in `finally` |

### Content-Type Mapping for Derivative Upload

- `.webp` → `image/webp`
- `.avif` → `image/avif`
- S3 keys: `processed/{photoId}/{filename}` (e.g., `processed/abc-123/300w.webp`)
- Original file in temp dir is skipped during upload (starts with "original")

### Testing: Extracting BullMQ Processor from Mock

- BullMQ Worker is mocked globally in `setup.ts`
- To test the processor function: dynamic import the module, then extract from `MockWorker.mock.calls`
- `workerCalls[lastIndex][1]` is the processor function (2nd arg to `new Worker(name, processor, opts)`)
- SQLitePhotoRepository mock MUST use `vi.fn(function() { return mockRepo })` — arrow functions can't be called with `new`

### Preserved Behavior

- Progress reporting: 10% (start) → 80% (derivatives) → 90% (EXIF) → 100% (blur)
- DB update with `new SQLitePhotoRepository()` inside processor (BullMQ retry covers it)
- Error handlers (`on('error')`, `on('failed')`, `on('completed')`) unchanged
- `sharp.cache(false)` preserved
- `retryDbUpdate` helper preserved
- All existing Sharp pipeline logic delegated to `generateDerivatives` (unchanged)

### Cleanup Safety

- `finally` block ensures temp dir cleanup even on Sharp crash, S3 failure, or download error
- Cleanup failure itself is caught and logged (warns but doesn't throw)
- This prevents disk space leaks in the worker process

### Test Coverage: 24 Tests

- Temp dir creation (unique per photoId + attemptsMade)
- Download from storage adapter (getFile + writeFile to temp)
- Sharp processing with temp paths (generateDerivatives, metadata, EXIF, blur)
- Upload derivatives (readdir + readFile + saveFile per derivative)
- Content-type mapping (webp/avif)
- Skip non-file entries and original file during upload
- Progress reporting preserved (10, 80, 90, 100)
- DB update logic preserved
- Return value structure
- Cleanup on success, on processing failure, on upload failure, on download failure
- Cleanup failure doesn't propagate

## Task 11: Image Loader + Component/Page CloudFront URL Updates

### Two-Layer URL Strategy

- **Client-side** (`imageLoader.ts`): Reads `process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN` (build-time inlined by Next.js)
- **Server-side** (`factory.ts` → `getImageUrl()`): Reads `env.AWS_CLOUDFRONT_DOMAIN` (Zod-validated server env)
- Both produce identical URLs: `https://{domain}/processed/{photoId}/{filename}`
- Both fall back to `/api/images/{photoId}/{filename}` when no CloudFront domain

### imageLoader.ts Changes

- Added `getClientImageUrl(photoId, filename)` export for raw `<img>` tags in components
- `imageLoader` default export now extracts photoId from `/api/images/{photoId}` src path for CloudFront mode
- `cloudfrontDomain` is module-level const (evaluated once at import time)
- Extracted `selectBestWidth()` and `extractPhotoId()` helpers

### Component Update Patterns

| Component         | Element                 | Change                                                               |
| ----------------- | ----------------------- | -------------------------------------------------------------------- |
| PhotoGrid         | `<img>`                 | `/api/images/${id}/300w.webp` → `getClientImageUrl(id, "300w.webp")` |
| SortablePhotoCard | `<img>`                 | Same pattern                                                         |
| PhotoLightbox     | `<img>` (srcSet + main) | Both `buildSrcSet()` and slides array updated                        |
| AlbumDetailClient | `<img>` (DragOverlay)   | Same pattern                                                         |
| FadeImage         | `<Image>` (Next.js)     | NO CHANGE — already goes through imageLoader                         |

### Page Update Patterns (Server-Side OG Images)

| Page                                | Change                                                            |
| ----------------------------------- | ----------------------------------------------------------------- |
| `photo/[slug]/page.tsx`             | OG image: `getImageUrl(photo.id, "1200w.webp")`                   |
| `albums/[id]/page.tsx`              | OG image: `getImageUrl(coverPhotoId/firstReady.id, "1200w.webp")` |
| `albums/[id]/photo/[slug]/page.tsx` | OG image: `getImageUrl(photo.id, "1200w.webp")`                   |
| `albums/page.tsx`                   | NO CHANGE — uses `<Image>` component (goes through imageLoader)   |

### NEXT_PUBLIC_CLOUDFRONT_DOMAIN vs AWS_CLOUDFRONT_DOMAIN

- `AWS_CLOUDFRONT_DOMAIN`: Server-side only, Zod-validated in `env.ts`, used by `getImageUrl()` in factory
- `NEXT_PUBLIC_CLOUDFRONT_DOMAIN`: Client-side, build-time inlined by Next.js, used by `imageLoader.ts`
- Both should be set to the same value in production
- `NEXT_PUBLIC_*` vars CANNOT go in server-side Zod schema (they're inlined at build, not available at runtime)

### Testing

- 9 tests in `src/lib/__tests__/imageLoader.test.ts`
- Uses `vi.resetModules()` + dynamic `import()` to test different env states
- 3 categories: without CloudFront (3 tests), with CloudFront (3 tests), getClientImageUrl (3 tests)

## Task 12: Health Check Route — Storage Adapter Integration

### Architecture Change

- Replaced filesystem-specific `access()` check with storage adapter abstraction
- Both S3 and filesystem modes now use same `listFiles("health-check/")` operation
- No actual files created — just verifies adapter connectivity

### Implementation Pattern

- **Before**: `await access(env.STORAGE_PATH, constants.R_OK | constants.W_OK)` (filesystem only)
- **After**: `const adapter = getStorageAdapter(); await adapter.listFiles("health-check/")`
- Adapter factory handles backend selection (`env.STORAGE_BACKEND`)

### Response Format Preserved

- Status: `"healthy"` (200) or `"unhealthy"` (503)
- Checks object: `{ database: { status, error? }, storage: { status, error? } }`
- No breaking changes to API contract

### Testing Approach: TDD RED → GREEN

**Test file**: `src/app/api/__tests__/health.test.ts` (11 tests)

**Test categories**:

1. **Filesystem mode** (4 tests): healthy, database error, storage error, both fail
2. **S3 mode** (2 tests): healthy, storage error (database error tested in filesystem mode)
3. **Response format** (3 tests): structure, 200 status, 503 status
4. **Error handling** (2 tests): unknown database error, unknown storage error

**Mock strategy**:

- Mock `db.run()` to return `{ changes: 0 }` (RunResult type)
- Mock `getStorageAdapter()` to return object with `listFiles` vi.fn()
- Both success and rejection paths tested

**Test results**: All 11 pass ✓

### Key Implementation Details

- `listFiles("health-check/")` is lightweight operation (no file creation)
- Works identically for both FilesystemStorageAdapter and S3StorageAdapter
- Error messages propagate naturally from adapter implementations
- No special error handling needed — adapter errors caught and formatted

### Verification

- ✓ `npm run test -- src/app/api/__tests__/health.test.ts`: 11 tests pass
- ✓ Full test suite: 368 tests pass (no regressions)
- ✓ `npm run build`: Production build succeeds
- ✓ `npm run typecheck`: No type errors

### Files Changed

- **Modified**: `src/app/api/health/route.ts` (removed fs/promises, added storage adapter)
- **Created**: `src/app/api/__tests__/health.test.ts` (11 tests)

### Removed Dependencies

- `import { access, constants } from "fs/promises"` — no longer needed
- `import { env } from "@/infrastructure/config/env"` — no longer needed (adapter reads env internally)

### Next Steps

- Health check now backend-agnostic
- Ready for S3 deployment (health check will verify S3 connectivity)
- Filesystem mode continues to work unchanged

## Task 14: S3 Pipeline Integration Test + Full Regression

### Test Coverage: 17 Tests in 7 Phases

**File**: `src/__tests__/integration/s3-pipeline.test.ts`

| Phase                                 | Tests | What's Tested                                                      |
| ------------------------------------- | ----- | ------------------------------------------------------------------ |
| Upload → S3 Save                      | 3     | File upload, enqueue with S3 key, DB record creation               |
| Worker Download → Process → S3 Upload | 6     | S3 download, derivative upload, metadata update, progress, cleanup |
| URL Generation                        | 2     | CloudFront URL format, all derivative sizes/formats                |
| Full E2E Pipeline                     | 1     | Upload → enqueue → worker process → serve (9-step verification)    |
| Delete Pipeline                       | 1     | Cascade delete originals + processed from S3                       |
| Storage Factory                       | 1     | S3 adapter creation via factory                                    |
| Error Handling                        | 3     | Download failure, upload failure, auth rejection                   |

### Key Testing Patterns

**BullMQ Worker Processor Extraction (Critical Gotcha)**:

- Worker constructor called at module import time → `vi.mock("bullmq")` captures it
- `vi.clearAllMocks()` in `beforeEach` wipes `.mock.calls` — processor reference is lost
- Solution: Cache processor on first extraction, subsequent calls return cached value
- Pattern: `if (_cachedProcessor) return _cachedProcessor;`
- Matches existing `imageProcessor.test.ts` guard: `if (workerCalls.length > 0)`

**vi.hoisted() Required for Mock Repository**:

- `vi.mock()` factories are hoisted above all declarations
- Mock repository referenced inside `vi.mock("...SQLitePhotoRepository")` factory
- Must declare with `vi.hoisted()` — regular `const` is not initialized at hoist time
- Error: `ReferenceError: Cannot access 'mockRepository' before initialization`

**Mock .calls Type Assertion**:

- `mockFn.mock.calls` is typed as `any[][]` — cannot use tuple type in `.filter()` callback
- Pattern: Cast to `unknown[][]` then use `(call[0] as string).startsWith(...)`
- Avoids `@ts-ignore` / `as any` while keeping type safety at assertion points

**Integration Test Cannot Assert Raw DB**:

- Upload route creates `new SQLitePhotoRepository()` at module scope
- Mock intercepts this, so `photoRepository.save()` → `mockRepository.save()`
- Raw `testSqlite.prepare(...).get(id)` returns undefined (mock doesn't write to real DB)
- Solution: Assert via `mockRepository.save` calls instead of raw SQL queries

### Regression Results

- ✓ 385 tests pass (368 existing + 17 new)
- ✓ `npm run typecheck`: 0 errors
- ✓ `npm run build`: Production build succeeds (21 routes)
- ✓ `npm run lint`: 0 new errors (19 pre-existing in `health.test.ts`)
