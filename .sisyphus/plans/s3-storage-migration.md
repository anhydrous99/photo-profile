# S3 Storage Migration

## TL;DR

> **Quick Summary**: Migrate image storage from local filesystem to AWS S3 with CloudFront CDN serving. Introduce a `StorageAdapter` interface enabling both S3 (production) and filesystem (local dev) backends, switchable via `STORAGE_BACKEND` env var. Worker downloads originals from S3 to `/tmp`, processes with Sharp, uploads derivatives back to S3.
>
> **Deliverables**:
>
> - `StorageAdapter` interface + S3 implementation + refactored filesystem implementation
> - Environment config with AWS variables (conditional Zod validation)
> - Worker refactored for S3 download→process→upload flow with `/tmp` cleanup
> - Image loader + 10 component/page files updated to produce CloudFront URLs
> - `/api/images/` route kept as S3 proxy fallback (OG images, edge cases)
> - Health check updated for S3 connectivity
> - Docker config updated (remove storage volumes, add AWS env vars)
> - TDD test suite for storage adapter and updated pipeline
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (interface) → Task 2 (S3 impl) → Task 4 (worker) → Task 6 (image loader + components) → Task 9 (integration test)

---

## Context

### Original Request

User is deploying this photography portfolio to AWS EC2 and needs to transition from local filesystem storage to S3 for ~2TB of images (local/EBS storage is too expensive).

### Interview Summary

**Key Discussions**:

- **Image serving**: CloudFront CDN with S3 as origin — direct CloudFront URLs from components (not proxied through app server)
- **Storage pattern**: Adapter pattern with `STORAGE_BACKEND=s3|filesystem` env var — keeps local dev easy
- **Worker strategy**: Download original from S3 → /tmp, process with Sharp locally, upload derivatives back to S3, cleanup temp files
- **Test approach**: TDD with Vitest — write failing tests first, then implement
- **Deployment**: Fresh deployment, no data migration. User handles AWS infra (S3 bucket, CloudFront distribution) separately
- **CDN URL strategy**: Direct CloudFront URLs — update `imageLoader.ts` + 10 component/page files. Keep `/api/images/` route as S3-backed fallback
- **Backfill scripts**: Skip updating for now

**Research Findings**:

- Current storage layer: 3 functions in `fileStorage.ts` (`saveOriginalFile`, `findOriginalFile`, `deletePhotoFiles`) — well-contained
- Image serving route (`/api/images/[photoId]/[filename]`) bypasses storage layer — reads filesystem directly with `readFile()`/`readdir()`/`stat()`
- Worker receives `originalPath` (absolute filesystem path) from BullMQ job data
- 12 occurrences of `/api/images/` URL construction across 10 files (9 components/pages + 1 API route)
- Sharp `imageService.ts` uses `.toFile()` — needs no change since worker will provide local temp paths
- BullMQ job interface `ImageJobData` has `originalPath: string` — needs renaming to `originalKey`
- `vitest.config.ts` already sets `STORAGE_PATH: "/tmp/test-storage"` in test env

### Metis Review

**Identified Gaps** (addressed):

- **CDN URL strategy was undefined**: Resolved — direct CloudFront URLs, update components + imageLoader
- **OG image URLs must be absolute**: Plan includes making OG URLs use full `https://{CLOUDFRONT_DOMAIN}/...` paths
- **`ImageJobData.originalPath` → `originalKey`**: BullMQ job interface must change from filesystem path to S3 key
- **Content-Type required on S3 PutObject**: Adapter `saveFile` method must accept/derive content type
- **Worker /tmp cleanup needs try/finally**: Prevents temp file leaks on Sharp crashes
- **Conditional Zod validation**: `STORAGE_PATH` optional when `STORAGE_BACKEND=s3`; AWS vars optional when `STORAGE_BACKEND=filesystem`
- **Worker retry idempotency**: Use unique temp path per attempt (not per job) to avoid stale temp state
- **S3 eventual consistency on delete**: Acceptable for personal portfolio — document, don't solve

---

## Work Objectives

### Core Objective

Replace local filesystem image storage with AWS S3, serving processed images via CloudFront CDN, while maintaining a filesystem adapter for local development.

### Concrete Deliverables

- `src/infrastructure/storage/types.ts` — `StorageAdapter` interface
- `src/infrastructure/storage/s3StorageAdapter.ts` — S3 implementation
- `src/infrastructure/storage/filesystemStorageAdapter.ts` — Refactored filesystem implementation
- `src/infrastructure/storage/factory.ts` — Adapter factory based on env var
- `src/infrastructure/storage/s3Client.ts` — Shared S3 client instance
- `src/infrastructure/storage/index.ts` — Updated barrel exports
- `src/infrastructure/config/env.ts` — Updated Zod schema with AWS vars + conditional validation
- `src/infrastructure/jobs/queues.ts` — `ImageJobData.originalPath` → `originalKey`
- `src/infrastructure/jobs/workers/imageProcessor.ts` — Download/process/upload flow
- `src/app/api/images/[photoId]/[filename]/route.ts` — S3 fallback proxy
- `src/app/api/admin/upload/route.ts` — Use storage adapter
- `src/app/api/admin/photos/[id]/route.ts` — Use storage adapter for delete
- `src/app/api/admin/photos/[id]/reprocess/route.ts` — Use storage adapter for find
- `src/app/api/admin/albums/[id]/route.ts` — Use storage adapter for cascade delete
- `src/app/api/health/route.ts` — S3 connectivity check
- `src/lib/imageLoader.ts` — CloudFront URL construction
- 7 component/page files — Updated image URL construction
- `vitest.config.ts` — Add `STORAGE_BACKEND` env for tests
- `docker-compose.yml` — Remove storage volumes, add AWS env vars
- TDD test files for all new/changed modules

### Definition of Done

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build` succeeds
- [ ] `npx vitest run` — all tests pass (existing + new)
- [ ] `npm run lint` passes
- [ ] With `STORAGE_BACKEND=filesystem`: upload/process/serve flow works as before
- [ ] With `STORAGE_BACKEND=s3`: upload saves to S3, worker downloads/processes/uploads derivatives, images served via CloudFront URLs

### Must Have

- StorageAdapter interface with both S3 and filesystem implementations
- Environment-based switching (`STORAGE_BACKEND` env var)
- Worker downloads originals to `/tmp`, processes locally, uploads results, cleans up
- `/tmp` cleanup in `finally` blocks (not just success path)
- UUID validation preserved in S3 adapter (key injection prevention)
- Content-Type set on all S3 PutObject calls
- `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` as dependencies
- Unique temp directory per worker attempt (idempotent retries)
- All existing 13 test files continue passing

### Must NOT Have (Guardrails)

- **DO NOT** change Sharp pipeline logic (`.rotate()`, `.withMetadata()`, quality settings, derivative sizes)
- **DO NOT** change database schema — S3 keys are derived from `photoId`, not stored
- **DO NOT** add S3 presigned URLs, signed CloudFront URLs, or Lambda@Edge
- **DO NOT** add CloudFront invalidation logic — content-addressed filenames are immutable
- **DO NOT** add S3 lifecycle policies, versioning, or encryption config in app code
- **DO NOT** hardcode AWS credentials — use standard credential chain
- **DO NOT** upload directly from browser to S3 — upload still goes through API server
- **DO NOT** touch auth system, database layer, or domain entities
- **DO NOT** update backfill scripts (explicitly out of scope)
- **DO NOT** add `@ts-ignore`, `@ts-expect-error`, or `as any`

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision

- **Infrastructure exists**: YES (Vitest + Playwright)
- **Automated tests**: TDD (test-first)
- **Framework**: Vitest

### TDD Workflow Per Task

Each TODO follows RED-GREEN-REFACTOR:

**Task Structure:**

1. **RED**: Write failing test first
   - Test file: `src/infrastructure/storage/__tests__/{name}.test.ts`
   - Test command: `npx vitest run {file}`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `npx vitest run {file}`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Command: `npx vitest run`
   - Expected: ALL tests PASS (including existing)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type            | Tool                         | How Agent Verifies                         |
| --------------- | ---------------------------- | ------------------------------------------ |
| Storage adapter | Bash (vitest)                | Run unit tests with mocked S3 SDK          |
| API routes      | Bash (vitest)                | Run integration tests with mocked storage  |
| Worker          | Bash (vitest)                | Run unit tests with mocked storage + Sharp |
| Image loader    | Bash (vitest)                | Run unit test with env vars                |
| Components      | Bash (typecheck + build)     | TypeScript compilation, Next.js build      |
| Docker          | Bash (docker compose config) | Validate compose file                      |
| Full pipeline   | Bash (vitest)                | Integration test mocking S3 SDK end-to-end |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: StorageAdapter interface + types
├── Task 2: Environment config (AWS vars + conditional validation)
└── Task 3: Install AWS SDK dependencies

Wave 2 (After Wave 1):
├── Task 4: S3 storage adapter implementation
├── Task 5: Filesystem storage adapter (refactor from fileStorage.ts)
├── Task 6: Storage factory + barrel export update
└── Task 7: BullMQ job interface update (originalPath → originalKey)

Wave 3 (After Wave 2):
├── Task 8: Worker refactor (download/process/upload flow)
├── Task 9: Upload route + delete routes (use adapter)
├── Task 10: Image serving route (S3 fallback proxy)
└── Task 11: Image loader + component URL updates

Wave 4 (After Wave 3):
├── Task 12: Health check update
├── Task 13: Docker config update
└── Task 14: Integration test + regression check

Critical Path: Task 1 → Task 4 → Task 8 → Task 14
```

### Dependency Matrix

| Task | Depends On           | Blocks       | Can Parallelize With |
| ---- | -------------------- | ------------ | -------------------- |
| 1    | None                 | 4, 5, 6      | 2, 3                 |
| 2    | None                 | 4, 6, 8, 14  | 1, 3                 |
| 3    | None                 | 4, 5         | 1, 2                 |
| 4    | 1, 2, 3              | 6, 8, 9, 10  | 5, 7                 |
| 5    | 1, 3                 | 6            | 4, 7                 |
| 6    | 4, 5                 | 8, 9, 10, 12 | 7                    |
| 7    | None                 | 8            | 4, 5, 6              |
| 8    | 6, 7                 | 14           | 9, 10, 11            |
| 9    | 6                    | 14           | 8, 10, 11            |
| 10   | 6                    | 14           | 8, 9, 11             |
| 11   | 2                    | 14           | 8, 9, 10             |
| 12   | 6                    | 14           | 8, 9, 10, 11, 13     |
| 13   | 2                    | 14           | 8, 9, 10, 11, 12     |
| 14   | 8, 9, 10, 11, 12, 13 | None         | None (final)         |

### Agent Dispatch Summary

| Wave | Tasks        | Recommended Agents                             |
| ---- | ------------ | ---------------------------------------------- |
| 1    | 1, 2, 3      | 3 parallel quick tasks                         |
| 2    | 4, 5, 6, 7   | 4 parallel unspecified-high tasks              |
| 3    | 8, 9, 10, 11 | 4 parallel unspecified-high tasks              |
| 4    | 12, 13, 14   | 3 parallel (12, 13 quick; 14 unspecified-high) |

---

## TODOs

- [x] 1. Define StorageAdapter interface and types

  **What to do**:
  - **RED**: Write a type-checking test that imports `StorageAdapter` and verifies the interface shape (methods, parameter types, return types)
  - Create `src/infrastructure/storage/types.ts` with the `StorageAdapter` interface:
    ```typescript
    interface StorageAdapter {
      saveFile(key: string, data: Buffer, contentType: string): Promise<void>;
      getFile(key: string): Promise<Buffer>;
      getFileStream(key: string): Promise<ReadableStream>;
      deleteFiles(prefix: string): Promise<void>;
      fileExists(key: string): Promise<boolean>;
      listFiles(prefix: string): Promise<string[]>;
    }
    ```
  - Export `StorageAdapter` type and any helper types (e.g., `StorageKey` utility type)
  - **GREEN**: Ensure test passes with the interface definition
  - **REFACTOR**: Clean up types, ensure JSDoc comments on each method

  **Must NOT do**:
  - Do NOT create implementations yet — this is types only
  - Do NOT add S3-specific types (that's Task 4)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation, pure TypeScript interface — minimal complexity
  - **Skills**: []
    - No special skills needed for type definitions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/domain/repositories/PhotoRepository.ts` — Existing repository interface pattern in this project (pure interface, no implementation)
  - `src/domain/entities/Photo.ts` — Entity type pattern (plain TypeScript interface)

  **API/Type References**:
  - `src/infrastructure/storage/fileStorage.ts:15-32` — `saveOriginalFile` signature — the adapter's `saveFile` must support this use case (Buffer from File.arrayBuffer)
  - `src/infrastructure/storage/fileStorage.ts:43-57` — `findOriginalFile` signature — adapter needs `listFiles` and `fileExists` to replicate this scan behavior
  - `src/infrastructure/storage/fileStorage.ts:67-79` — `deletePhotoFiles` signature — adapter needs `deleteFiles` with prefix to delete both originals and processed

  **Why Each Reference Matters**:
  - `PhotoRepository.ts` shows how this project defines interfaces (in domain layer, zero dependencies) — follow same convention
  - `fileStorage.ts` functions show the exact operations needed — adapter must support all three use cases

  **Acceptance Criteria**:
  - [ ] File exists: `src/infrastructure/storage/types.ts`
  - [ ] `StorageAdapter` interface exported with methods: `saveFile`, `getFile`, `getFileStream`, `deleteFiles`, `fileExists`, `listFiles`
  - [ ] `npx vitest run src/infrastructure/storage/__tests__/types.test.ts` → PASS
  - [ ] `npm run typecheck` → no new errors

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: StorageAdapter interface is importable and type-correct
    Tool: Bash (vitest)
    Preconditions: types.ts created
    Steps:
      1. npx vitest run src/infrastructure/storage/__tests__/types.test.ts
      2. Assert: exit code 0
      3. Assert: output contains "pass"
    Expected Result: Type test passes
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(storage): define StorageAdapter interface for S3 migration`
  - Files: `src/infrastructure/storage/types.ts`, `src/infrastructure/storage/__tests__/types.test.ts`
  - Pre-commit: `npx vitest run src/infrastructure/storage/__tests__/types.test.ts`

---

- [x] 2. Update environment config with AWS variables and conditional validation

  **What to do**:
  - **RED**: Write test for env validation:
    - `STORAGE_BACKEND=s3` requires `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_DOMAIN`; `STORAGE_PATH` is optional
    - `STORAGE_BACKEND=filesystem` requires `STORAGE_PATH`; AWS vars are optional
    - `STORAGE_BACKEND` defaults to `filesystem` if not set (backward compatible)
    - Optional: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (for dev; production uses IAM roles)
  - Update `src/infrastructure/config/env.ts`:
    - Add `STORAGE_BACKEND: z.enum(["s3", "filesystem"]).default("filesystem")`
    - Add AWS vars with `.optional()` at schema level
    - Add `.superRefine()` or `.refine()` for conditional validation
    - Add `AWS_CLOUDFRONT_DOMAIN` (e.g., `d1234.cloudfront.net` — no protocol prefix, app adds `https://`)
  - **GREEN**: Make all env tests pass
  - **REFACTOR**: Update `vitest.config.ts` to include `STORAGE_BACKEND: "filesystem"` in test env

  **Must NOT do**:
  - Do NOT change the two existing `eslint-disable` comments (NodeJS namespace augmentation)
  - Do NOT change the fail-fast behavior (throw on invalid env)
  - Do NOT hardcode any AWS values

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit with Zod schema changes — well-scoped
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 6, 8, 11, 13, 14
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/infrastructure/config/env.ts:1-47` — Current Zod schema pattern (full file — this is what's being modified)

  **Documentation References**:
  - Zod `.refine()` / `.superRefine()` for conditional validation

  **Why Each Reference Matters**:
  - `env.ts` is the exact file being modified — executor must preserve the existing pattern (safeParse, fail-fast, global namespace augmentation)

  **Acceptance Criteria**:
  - [ ] `STORAGE_BACKEND` env var accepted with values `s3` | `filesystem` (default: `filesystem`)
  - [ ] When `STORAGE_BACKEND=s3`: `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_DOMAIN` required; `STORAGE_PATH` optional
  - [ ] When `STORAGE_BACKEND=filesystem`: `STORAGE_PATH` required; AWS vars optional
  - [ ] `vitest.config.ts` updated with `STORAGE_BACKEND: "filesystem"` in test env
  - [ ] `npx vitest run src/infrastructure/config/__tests__/env.test.ts` → PASS
  - [ ] `npm run typecheck` → no new errors

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: S3 backend requires AWS vars
    Tool: Bash (vitest)
    Preconditions: env.ts updated
    Steps:
      1. npx vitest run src/infrastructure/config/__tests__/env.test.ts
      2. Assert: test "STORAGE_BACKEND=s3 requires AWS_REGION" passes
      3. Assert: test "STORAGE_BACKEND=filesystem requires STORAGE_PATH" passes
      4. Assert: test "defaults to filesystem" passes
    Expected Result: All conditional validation tests pass
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(config): add AWS and storage backend env vars with conditional validation`
  - Files: `src/infrastructure/config/env.ts`, `src/infrastructure/config/__tests__/env.test.ts`, `vitest.config.ts`
  - Pre-commit: `npx vitest run src/infrastructure/config/__tests__/env.test.ts`

---

- [x] 3. Install AWS SDK dependencies

  **What to do**:
  - Install `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` as production dependencies
  - Verify installation succeeds and `npm run typecheck` still passes
  - Verify `npm run build` still succeeds (no import side-effects)

  **Must NOT do**:
  - Do NOT import these packages in any source file yet — just install

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single npm install command
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None

  **References**: None needed — straightforward dependency installation.

  **Acceptance Criteria**:
  - [ ] `@aws-sdk/client-s3` in `package.json` dependencies
  - [ ] `@aws-sdk/lib-storage` in `package.json` dependencies
  - [ ] `npm run typecheck` → passes
  - [ ] `npm run build` → passes

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: AWS SDK installed and build passes
    Tool: Bash
    Preconditions: None
    Steps:
      1. npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
      2. Assert: exit code 0
      3. npm run typecheck
      4. Assert: exit code 0
    Expected Result: Dependencies installed, no type errors
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `chore(deps): add AWS SDK S3 client and multipart upload library`
  - Files: `package.json`, `package-lock.json`
  - Pre-commit: `npm run typecheck`

---

- [ ] 4. Implement S3 storage adapter

  **What to do**:
  - **RED**: Write comprehensive tests for `S3StorageAdapter` implementing `StorageAdapter`:
    - `saveFile(key, data, contentType)` → calls `PutObject` (small files) or `Upload` (large files, >5MB threshold)
    - `getFile(key)` → calls `GetObject`, returns Buffer
    - `getFileStream(key)` → calls `GetObject`, returns readable stream
    - `deleteFiles(prefix)` → calls `ListObjectsV2` + `DeleteObjects` (batch)
    - `fileExists(key)` → calls `HeadObject`, returns boolean
    - `listFiles(prefix)` → calls `ListObjectsV2`, returns string array of keys
    - Error handling: S3 `NoSuchKey` → throw meaningful error
    - UUID validation on keys containing photoIds
    - Content-Type passed through to PutObject
    - AbortController timeout on GetObject (30s default)
  - Create `src/infrastructure/storage/s3Client.ts` — shared S3Client instance using env vars
  - Create `src/infrastructure/storage/s3StorageAdapter.ts` — implements `StorageAdapter`
  - **GREEN**: Make all S3 adapter tests pass (mock `@aws-sdk/client-s3`)
  - **REFACTOR**: Clean up, ensure good error messages

  **Must NOT do**:
  - Do NOT use real S3 in tests — mock `@aws-sdk/client-s3` entirely
  - Do NOT hardcode bucket name — read from `env.AWS_S3_BUCKET`
  - Do NOT hardcode region — read from `env.AWS_REGION`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex implementation with AWS SDK, mocking, error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Tasks 6, 8, 9, 10
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/infrastructure/storage/fileStorage.ts:1-80` — Current storage implementation (full file) — S3 adapter must support all 3 use cases (save, find, delete)
  - `src/infrastructure/storage/types.ts` — The interface to implement (created in Task 1)
  - `src/app/api/__tests__/admin-photos.test.ts:22-40` — Mocking pattern for Vitest (`vi.mock`)

  **API/Type References**:
  - `src/infrastructure/config/env.ts` — Where `AWS_S3_BUCKET`, `AWS_REGION` are read from (updated in Task 2)

  **External References**:
  - `@aws-sdk/client-s3` — `S3Client`, `PutObjectCommand`, `GetObjectCommand`, `HeadObjectCommand`, `ListObjectsV2Command`, `DeleteObjectsCommand`
  - `@aws-sdk/lib-storage` — `Upload` class for multipart uploads (originals up to 100MB)

  **Why Each Reference Matters**:
  - `fileStorage.ts` shows the exact operations the S3 adapter must replicate
  - `admin-photos.test.ts` shows how this project mocks modules with Vitest — follow same `vi.mock` pattern for S3 SDK

  **Acceptance Criteria**:
  - [ ] File exists: `src/infrastructure/storage/s3Client.ts`
  - [ ] File exists: `src/infrastructure/storage/s3StorageAdapter.ts`
  - [ ] `S3StorageAdapter` implements `StorageAdapter` interface
  - [ ] `saveFile` calls PutObject with correct Content-Type header
  - [ ] `getFile` returns Buffer with AbortController timeout
  - [ ] `deleteFiles` handles batch deletion via ListObjectsV2 + DeleteObjects
  - [ ] `fileExists` returns boolean (true/false, no throw on missing)
  - [ ] `listFiles` returns array of S3 object keys
  - [ ] All S3 SDK calls are mocked in tests (no real AWS calls)
  - [ ] `npx vitest run src/infrastructure/storage/__tests__/s3StorageAdapter.test.ts` → PASS
  - [ ] `npm run typecheck` → no new errors

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: S3 adapter passes all unit tests
    Tool: Bash (vitest)
    Preconditions: Tasks 1, 2, 3 complete
    Steps:
      1. npx vitest run src/infrastructure/storage/__tests__/s3StorageAdapter.test.ts
      2. Assert: exit code 0
      3. Assert: output shows all tests passing (saveFile, getFile, deleteFiles, fileExists, listFiles)
    Expected Result: All S3 adapter methods tested and passing
    Evidence: Terminal output captured

  Scenario: S3 adapter handles missing keys gracefully
    Tool: Bash (vitest)
    Preconditions: Test includes NoSuchKey scenario
    Steps:
      1. Verify test file includes test case for "getFile throws on missing key"
      2. npx vitest run src/infrastructure/storage/__tests__/s3StorageAdapter.test.ts --reporter=verbose
      3. Assert: "NoSuchKey" or "not found" test case exists and passes
    Expected Result: Error handling test passes
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(storage): implement S3 storage adapter with AWS SDK`
  - Files: `src/infrastructure/storage/s3Client.ts`, `src/infrastructure/storage/s3StorageAdapter.ts`, `src/infrastructure/storage/__tests__/s3StorageAdapter.test.ts`
  - Pre-commit: `npx vitest run src/infrastructure/storage/__tests__/s3StorageAdapter.test.ts`

---

- [ ] 5. Refactor filesystem storage into FilesystemStorageAdapter

  **What to do**:
  - **RED**: Write tests for `FilesystemStorageAdapter` implementing `StorageAdapter` interface
    - Must pass same test scenarios as S3 adapter (save, get, delete, exists, list)
    - Uses actual filesystem (temp directories in test)
  - Create `src/infrastructure/storage/filesystemStorageAdapter.ts`:
    - Wraps the existing logic from `fileStorage.ts` into the `StorageAdapter` interface
    - `saveFile(key, data, contentType)` → `writeFile` at `{STORAGE_PATH}/{key}`
    - `getFile(key)` → `readFile` from `{STORAGE_PATH}/{key}`
    - `getFileStream(key)` → `createReadStream` from `{STORAGE_PATH}/{key}`
    - `deleteFiles(prefix)` → `rm` recursive at `{STORAGE_PATH}/{prefix}`
    - `fileExists(key)` → `access` check
    - `listFiles(prefix)` → `readdir` at `{STORAGE_PATH}/{prefix}`
    - Preserve `assertValidUUID` validation from current `fileStorage.ts`
  - **GREEN**: Make tests pass
  - Keep `fileStorage.ts` temporarily (will be removed when barrel export is updated in Task 6)

  **Must NOT do**:
  - Do NOT delete `fileStorage.ts` yet (consumers still import from it until Task 6)
  - Do NOT change the directory structure (`originals/`, `processed/` subdirectories)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Refactoring existing code into new interface — must preserve behavior exactly
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/infrastructure/storage/fileStorage.ts:1-80` — CRITICAL: This is the code being refactored. Every line of logic must be preserved in the new adapter.
  - `src/infrastructure/storage/types.ts` — Interface to implement (created in Task 1)

  **API/Type References**:
  - `src/infrastructure/validation/index.ts` — `assertValidUUID` function (must still be called for path traversal prevention)
  - `src/infrastructure/config/env.ts` — `env.STORAGE_PATH` (base directory for filesystem operations)

  **Why Each Reference Matters**:
  - `fileStorage.ts` is being refactored — executor must understand every operation to correctly wrap it
  - `assertValidUUID` must be preserved — security validation

  **Acceptance Criteria**:
  - [ ] File exists: `src/infrastructure/storage/filesystemStorageAdapter.ts`
  - [ ] `FilesystemStorageAdapter` implements `StorageAdapter` interface
  - [ ] All operations use `env.STORAGE_PATH` as base directory
  - [ ] UUID validation preserved on photo-related operations
  - [ ] `npx vitest run src/infrastructure/storage/__tests__/filesystemStorageAdapter.test.ts` → PASS
  - [ ] `npm run typecheck` → no new errors

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Filesystem adapter passes all unit tests
    Tool: Bash (vitest)
    Preconditions: Task 1 complete
    Steps:
      1. npx vitest run src/infrastructure/storage/__tests__/filesystemStorageAdapter.test.ts
      2. Assert: exit code 0
      3. Assert: all tests pass
    Expected Result: Filesystem adapter correctly implements StorageAdapter
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `refactor(storage): wrap filesystem storage into StorageAdapter interface`
  - Files: `src/infrastructure/storage/filesystemStorageAdapter.ts`, `src/infrastructure/storage/__tests__/filesystemStorageAdapter.test.ts`
  - Pre-commit: `npx vitest run src/infrastructure/storage/__tests__/filesystemStorageAdapter.test.ts`

---

- [ ] 6. Create storage factory and update barrel exports

  **What to do**:
  - **RED**: Write test for factory function:
    - `STORAGE_BACKEND=s3` → returns `S3StorageAdapter` instance
    - `STORAGE_BACKEND=filesystem` → returns `FilesystemStorageAdapter` instance
    - Default (unset) → returns `FilesystemStorageAdapter` (backward compatible)
    - Factory returns singleton (same instance on repeated calls)
  - Create `src/infrastructure/storage/factory.ts`:
    - `getStorageAdapter(): StorageAdapter` — factory function
    - Reads `env.STORAGE_BACKEND` to select implementation
    - Caches instance (singleton pattern)
  - Update `src/infrastructure/storage/index.ts`:
    - Export `getStorageAdapter` from factory
    - Export `StorageAdapter` type from types
    - Create convenience functions that wrap adapter calls to maintain backward-compatible API:
      - `saveOriginalFile(photoId, file)` → derives key `originals/{photoId}/original.{ext}`, calls `adapter.saveFile()`
      - `findOriginalFile(photoId)` → calls `adapter.listFiles("originals/{photoId}/")`, finds `original.*`
      - `deletePhotoFiles(photoId)` → calls `adapter.deleteFiles("originals/{photoId}")` and `adapter.deleteFiles("processed/{photoId}")`
    - Export new function: `getImageUrl(photoId, filename)` → returns CloudFront URL (S3) or `/api/images/` URL (filesystem)
  - Delete `fileStorage.ts` (all logic now in `filesystemStorageAdapter.ts`)
  - **GREEN**: All tests pass
  - **REFACTOR**: Ensure all existing consumers still compile

  **Must NOT do**:
  - Do NOT change the signatures of `saveOriginalFile`, `findOriginalFile`, `deletePhotoFiles` — they are convenience wrappers
  - Do NOT break existing imports — `@/infrastructure/storage` must still export same function names

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration point — connects implementations, updates barrel exports, must maintain backward compatibility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Tasks 4, 5)
  - **Parallel Group**: Wave 2 (with Task 7)
  - **Blocks**: Tasks 8, 9, 10, 12
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `src/infrastructure/storage/index.ts:1-6` — Current barrel export (being replaced)
  - `src/infrastructure/storage/fileStorage.ts:1-80` — Current convenience functions to replicate as wrappers
  - `src/app/api/__tests__/admin-photos.test.ts:33-36` — How tests mock `@/infrastructure/storage` — new exports must be mockable the same way

  **API/Type References**:
  - `src/infrastructure/storage/types.ts` — `StorageAdapter` interface
  - `src/infrastructure/storage/s3StorageAdapter.ts` — S3 implementation
  - `src/infrastructure/storage/filesystemStorageAdapter.ts` — Filesystem implementation
  - `src/infrastructure/config/env.ts` — `env.STORAGE_BACKEND`, `env.AWS_CLOUDFRONT_DOMAIN`

  **Test References**:
  - `src/app/api/__tests__/admin-photos.test.ts:33-36` — Existing mock of `@/infrastructure/storage` — backward compat needed
  - `src/app/api/__tests__/admin-albums.test.ts` — Also mocks storage exports

  **Why Each Reference Matters**:
  - Current `index.ts` barrel shows what's currently exported — must be backward compatible
  - `admin-photos.test.ts` mock pattern proves existing tests import `{ deletePhotoFiles, saveOriginalFile }` from `@/infrastructure/storage` — these must still work
  - `fileStorage.ts` contains the logic that convenience wrappers must replicate

  **Acceptance Criteria**:
  - [ ] File exists: `src/infrastructure/storage/factory.ts`
  - [ ] `src/infrastructure/storage/index.ts` updated with factory + convenience wrappers + `getImageUrl`
  - [ ] `src/infrastructure/storage/fileStorage.ts` deleted
  - [ ] `saveOriginalFile`, `findOriginalFile`, `deletePhotoFiles` still exported (backward compat)
  - [ ] `getStorageAdapter()` returns correct adapter based on `STORAGE_BACKEND` env
  - [ ] `getImageUrl(photoId, filename)` returns CloudFront URL when `STORAGE_BACKEND=s3`
  - [ ] `npx vitest run src/infrastructure/storage/__tests__/factory.test.ts` → PASS
  - [ ] `npx vitest run` → ALL existing tests still pass (no import breakage)
  - [ ] `npm run typecheck` → no new errors

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Factory returns correct adapter and all tests pass
    Tool: Bash (vitest)
    Preconditions: Tasks 4, 5 complete
    Steps:
      1. npx vitest run src/infrastructure/storage/__tests__/factory.test.ts
      2. Assert: exit code 0
      3. npx vitest run
      4. Assert: exit code 0, all 13+ test files pass
    Expected Result: Factory works, zero regressions
    Evidence: Terminal output captured

  Scenario: Backward compatibility — existing mocks still work
    Tool: Bash (vitest)
    Preconditions: Factory and barrel exports updated
    Steps:
      1. npx vitest run src/app/api/__tests__/admin-photos.test.ts
      2. Assert: exit code 0
      3. npx vitest run src/app/api/__tests__/admin-albums.test.ts
      4. Assert: exit code 0
    Expected Result: Existing API tests pass without mock changes
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `refactor(storage): add factory pattern and update barrel exports for adapter switching`
  - Files: `src/infrastructure/storage/factory.ts`, `src/infrastructure/storage/index.ts`, `src/infrastructure/storage/__tests__/factory.test.ts`
  - Pre-commit: `npx vitest run`

---

- [ ] 7. Update BullMQ job interface (originalPath → originalKey)

  **What to do**:
  - **RED**: Write test verifying `ImageJobData` has `originalKey` (not `originalPath`)
  - Update `src/infrastructure/jobs/queues.ts`:
    - Change `ImageJobData.originalPath: string` → `ImageJobData.originalKey: string`
    - Update `enqueueImageProcessing(photoId, originalKey)` parameter name
    - Update JSDoc to reflect S3 key semantics
  - Update `src/app/api/admin/upload/route.ts`:
    - After `saveOriginalFile()`, derive the S3 key: `originals/{photoId}/original.{ext}`
    - Pass key (not filesystem path) to `enqueueImageProcessing()`
  - Update `src/app/api/admin/photos/[id]/reprocess/route.ts`:
    - After `findOriginalFile()`, derive the S3 key from the result
    - Pass key to `enqueueImageProcessing()`
  - **GREEN**: Tests pass
  - **REFACTOR**: Ensure all references consistent

  **Must NOT do**:
  - Do NOT change BullMQ queue name, retry config, or job options
  - Do NOT change the worker yet (that's Task 8)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Interface rename + 3 callsite updates — well-scoped
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/infrastructure/jobs/queues.ts:1-82` — Full file with `ImageJobData`, `ImageJobResult`, `enqueueImageProcessing()` — the code being modified

  **API/Type References**:
  - `src/infrastructure/jobs/queues.ts:9-12` — `ImageJobData` interface (renaming `originalPath` → `originalKey`)
  - `src/app/api/admin/upload/route.ts:85,108` — Where `filePath` from `saveOriginalFile()` is passed to `enqueueImageProcessing()`
  - `src/app/api/admin/photos/[id]/reprocess/route.ts` — Where `findOriginalFile()` result is passed to `enqueueImageProcessing()`

  **Why Each Reference Matters**:
  - `queues.ts` defines the interface — executor must rename field without breaking queue structure
  - Upload and reprocess routes are the only two callers of `enqueueImageProcessing()` — both need updating

  **Acceptance Criteria**:
  - [ ] `ImageJobData.originalPath` renamed to `ImageJobData.originalKey`
  - [ ] `enqueueImageProcessing` accepts `originalKey` parameter
  - [ ] Upload route derives S3 key from `saveOriginalFile()` result and passes to enqueue
  - [ ] Reprocess route derives S3 key from `findOriginalFile()` result and passes to enqueue
  - [ ] `npm run typecheck` → no new errors
  - [ ] `npx vitest run` → all existing tests still pass

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Job interface updated and types check
    Tool: Bash
    Preconditions: None
    Steps:
      1. npm run typecheck
      2. Assert: exit code 0
      3. npx vitest run
      4. Assert: exit code 0
    Expected Result: No type errors, no test regressions
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `refactor(jobs): rename ImageJobData.originalPath to originalKey for S3 compatibility`
  - Files: `src/infrastructure/jobs/queues.ts`, `src/app/api/admin/upload/route.ts`, `src/app/api/admin/photos/[id]/reprocess/route.ts`
  - Pre-commit: `npm run typecheck`

---

- [ ] 8. Refactor worker for S3 download→process→upload flow

  **What to do**:
  - **RED**: Write comprehensive worker tests:
    - Worker downloads original from storage adapter to unique temp path
    - Sharp processes from temp path (existing `generateDerivatives` unchanged)
    - Worker uploads each derivative back via storage adapter
    - `/tmp` cleanup happens in `finally` block (even on Sharp crash)
    - Unique temp dir per attempt: `/tmp/photo-worker-{photoId}-{attemptNumber}/`
    - EXIF extraction and blur placeholder still read from temp path
    - DB update logic unchanged
  - Refactor `src/infrastructure/jobs/workers/imageProcessor.ts`:
    - Import `getStorageAdapter` from `@/infrastructure/storage`
    - On job start: `adapter.getFile(originalKey)` → write to temp path
    - Run existing Sharp pipeline against temp path (no change to `generateDerivatives` call)
    - After derivatives generated: read each derivative file, `adapter.saveFile(key, buffer, contentType)` for each
    - Cleanup: `rm(tempDir, { recursive: true, force: true })` in `finally` block
    - Change `const { photoId, originalPath } = job.data` → `const { photoId, originalKey } = job.data`
    - Construct `outputDir` as temp directory, not `env.STORAGE_PATH/processed/`
  - **GREEN**: Tests pass with mocked storage adapter
  - **REFACTOR**: Clean up, verify error paths

  **Must NOT do**:
  - Do NOT change Sharp pipeline logic (`.rotate()`, `.withMetadata()`, quality, sizes)
  - Do NOT change BullMQ worker configuration (concurrency, connection, error handlers)
  - Do NOT change DB update logic (repository calls)
  - Do NOT remove the `sharp.cache(false)` line
  - Do NOT change the `retryDbUpdate` helper

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex refactoring — must handle download, temp files, upload, cleanup, error paths
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11)
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 6, 7

  **References**:

  **Pattern References**:
  - `src/infrastructure/jobs/workers/imageProcessor.ts:1-187` — CRITICAL: Full file being refactored. Executor must understand every line.
  - `src/infrastructure/services/imageService.ts:48-104` — `generateDerivatives(inputPath, outputDir)` — this function signature is NOT changing, only the inputPath and outputDir sources change

  **API/Type References**:
  - `src/infrastructure/jobs/queues.ts:9-12` — Updated `ImageJobData` with `originalKey` (from Task 7)
  - `src/infrastructure/storage/types.ts` — `StorageAdapter.getFile()`, `StorageAdapter.saveFile()` methods
  - `src/infrastructure/storage/index.ts` — `getStorageAdapter()` factory function (from Task 6)
  - `src/infrastructure/services/imageService.ts:9` — `THUMBNAIL_SIZES` constant — needed to construct derivative S3 keys

  **Why Each Reference Matters**:
  - `imageProcessor.ts` is the file being refactored — executor must preserve DB update logic, error handlers, progress reporting
  - `imageService.ts` shows `generateDerivatives` still takes `(inputPath, outputDir)` — worker provides temp paths, not S3 paths
  - `THUMBNAIL_SIZES` needed to know which derivative keys to upload (e.g., `processed/{photoId}/300w.webp`)

  **Acceptance Criteria**:
  - [ ] Worker reads `originalKey` from job data (not `originalPath`)
  - [ ] Worker downloads original via `adapter.getFile(originalKey)` to temp directory
  - [ ] Temp directory is `/tmp/photo-worker-{photoId}-{job.attemptsMade}/`
  - [ ] `generateDerivatives(tempOriginalPath, tempOutputDir)` called with temp paths
  - [ ] Each derivative uploaded via `adapter.saveFile()` with correct S3 key and Content-Type
  - [ ] Temp directory cleaned up in `finally` block
  - [ ] Sharp pipeline unchanged (`.rotate()`, `.withMetadata()`, quality settings preserved)
  - [ ] DB update logic unchanged
  - [ ] BullMQ error handlers unchanged
  - [ ] `npx vitest run src/infrastructure/jobs/__tests__/imageProcessor.test.ts` → PASS
  - [ ] `npm run typecheck` → no new errors

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Worker processes image with mocked S3 adapter
    Tool: Bash (vitest)
    Preconditions: Tasks 6, 7 complete
    Steps:
      1. npx vitest run src/infrastructure/jobs/__tests__/imageProcessor.test.ts --reporter=verbose
      2. Assert: exit code 0
      3. Assert: "downloads original" test passes
      4. Assert: "uploads derivatives" test passes
      5. Assert: "cleans up temp files" test passes
      6. Assert: "cleans up on error" test passes
    Expected Result: Worker correctly orchestrates S3 download/upload with temp file pattern
    Evidence: Terminal output captured

  Scenario: Temp cleanup happens even on Sharp failure
    Tool: Bash (vitest)
    Preconditions: Test includes error scenario
    Steps:
      1. Verify test mocks Sharp to throw
      2. Verify test asserts temp dir is cleaned up despite error
      3. npx vitest run src/infrastructure/jobs/__tests__/imageProcessor.test.ts -t "cleanup"
      4. Assert: passes
    Expected Result: Finally block executes on error path
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `refactor(worker): implement S3 download/process/upload flow with temp file cleanup`
  - Files: `src/infrastructure/jobs/workers/imageProcessor.ts`, `src/infrastructure/jobs/__tests__/imageProcessor.test.ts`
  - Pre-commit: `npx vitest run src/infrastructure/jobs/__tests__/imageProcessor.test.ts`

---

- [ ] 9. Update upload and delete API routes to use storage adapter

  **What to do**:
  - Update `src/app/api/admin/upload/route.ts`:
    - Import `saveOriginalFile` from updated `@/infrastructure/storage` (convenience wrapper — should already work due to Task 6 backward compat)
    - Verify `filePath` return from `saveOriginalFile` is now used correctly as `originalKey` for enqueue
  - Update `src/app/api/admin/photos/[id]/route.ts` (DELETE):
    - Import `deletePhotoFiles` from `@/infrastructure/storage` — should already work via convenience wrapper
  - Update `src/app/api/admin/photos/[id]/reprocess/route.ts`:
    - Import `findOriginalFile` from `@/infrastructure/storage` — should work via convenience wrapper
    - Verify the returned value is correctly used as S3 key for enqueue
  - Update `src/app/api/admin/albums/[id]/route.ts` (DELETE cascade):
    - Import `deletePhotoFiles` from `@/infrastructure/storage` — should work via convenience wrapper
  - **Key insight**: If Task 6 convenience wrappers are correctly implemented, these routes may need minimal changes. The main change is in the upload route's key derivation for `enqueueImageProcessing`.
  - Write/update integration tests verifying routes call storage adapter correctly

  **Must NOT do**:
  - Do NOT change auth checks, validation, or response formats
  - Do NOT change the upload file type/size validation
  - Do NOT change the `Promise.race` timeout pattern in upload route

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple route files to update and test, must verify backward compatibility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10, 11)
  - **Blocks**: Task 14
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `src/app/api/admin/upload/route.ts:1-142` — Full upload route (being updated)
  - `src/app/api/admin/photos/[id]/route.ts` — Photo PATCH/DELETE route (delete uses `deletePhotoFiles`)
  - `src/app/api/admin/photos/[id]/reprocess/route.ts` — Reprocess route (uses `findOriginalFile`)
  - `src/app/api/admin/albums/[id]/route.ts` — Album DELETE with cascade (uses `deletePhotoFiles`)

  **Test References**:
  - `src/app/api/__tests__/admin-photos.test.ts:33-36` — Existing mock pattern for storage — verify it still works
  - `src/app/api/__tests__/admin-albums.test.ts` — Existing mock pattern for storage

  **Why Each Reference Matters**:
  - All four route files are being updated — executor must read each and understand the current storage integration
  - Existing tests mock `@/infrastructure/storage` — must verify they still pass with updated barrel exports

  **Acceptance Criteria**:
  - [ ] Upload route saves file via storage adapter and derives correct key for enqueue
  - [ ] Delete routes call `deletePhotoFiles` (convenience wrapper handles adapter dispatch)
  - [ ] Reprocess route calls `findOriginalFile` and derives correct key for enqueue
  - [ ] `npx vitest run src/app/api/__tests__/admin-photos.test.ts` → PASS
  - [ ] `npx vitest run src/app/api/__tests__/admin-albums.test.ts` → PASS
  - [ ] `npm run typecheck` → no new errors

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Upload route works with storage adapter
    Tool: Bash (vitest)
    Preconditions: Task 6 complete
    Steps:
      1. npx vitest run src/app/api/__tests__/admin-photos.test.ts --reporter=verbose
      2. Assert: exit code 0
      3. Assert: upload and delete tests pass
    Expected Result: API routes correctly use storage adapter
    Evidence: Terminal output captured
  ```

  **Commit**: YES (groups with Task 10)
  - Message: `refactor(api): update upload and delete routes to use storage adapter`
  - Files: `src/app/api/admin/upload/route.ts`, `src/app/api/admin/photos/[id]/route.ts`, `src/app/api/admin/photos/[id]/reprocess/route.ts`, `src/app/api/admin/albums/[id]/route.ts`
  - Pre-commit: `npx vitest run src/app/api/__tests__/`

---

- [ ] 10. Update image serving route (S3 fallback proxy)

  **What to do**:
  - **RED**: Write tests for updated image serving route:
    - When `STORAGE_BACKEND=s3`: reads image from S3 via `adapter.getFile()`, serves with correct headers
    - When `STORAGE_BACKEND=filesystem`: reads from filesystem (existing behavior)
    - ETag generation works with S3 (use content hash instead of mtime)
    - Fallback logic: if requested size missing, finds largest derivative via `adapter.listFiles()`
    - 304 Not Modified still works
    - Cache-Control headers preserved (`public, max-age=31536000, immutable`)
  - Refactor `src/app/api/images/[photoId]/[filename]/route.ts`:
    - Import `getStorageAdapter` from `@/infrastructure/storage`
    - Replace `readFile(filePath)` → `adapter.getFile(key)` where key is `processed/{photoId}/{filename}`
    - Replace `readdir(photoDir)` → `adapter.listFiles("processed/{photoId}/")` for fallback
    - Replace `stat(filePath)` → use buffer.length for Content-Length, hash buffer for ETag
    - Preserve all validation (UUID check, filename check, MIME type check)
  - **GREEN**: Tests pass
  - **Note**: This route is kept as a fallback/proxy. Primary serving is via CloudFront URLs (Task 11). This route handles OG image requests from crawlers and edge cases.

  **Must NOT do**:
  - Do NOT remove this route entirely — it's needed for OG images and fallback
  - Do NOT change the MIME_TYPES map
  - Do NOT change UUID or filename validation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex route with caching, fallback logic, and S3 integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 11)
  - **Blocks**: Task 14
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `src/app/api/images/[photoId]/[filename]/route.ts:1-163` — CRITICAL: Full file being refactored

  **API/Type References**:
  - `src/infrastructure/storage/types.ts` — `StorageAdapter.getFile()`, `StorageAdapter.listFiles()`
  - `src/infrastructure/storage/index.ts` — `getStorageAdapter()` factory

  **Why Each Reference Matters**:
  - Full route file is being refactored — executor must preserve all validation, caching, and fallback logic while changing the I/O layer

  **Acceptance Criteria**:
  - [ ] Route uses `adapter.getFile()` instead of `readFile()`
  - [ ] Route uses `adapter.listFiles()` instead of `readdir()` for fallback
  - [ ] ETag generated from content hash (not mtime) when using S3
  - [ ] Cache-Control headers preserved: `public, max-age=31536000, immutable`
  - [ ] 304 Not Modified works with content-based ETag
  - [ ] UUID and filename validation preserved
  - [ ] MIME type mapping preserved
  - [ ] `npx vitest run src/app/api/__tests__/images.test.ts` → PASS
  - [ ] `npm run typecheck` → no new errors

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Image serving route works with storage adapter
    Tool: Bash (vitest)
    Preconditions: Task 6 complete
    Steps:
      1. npx vitest run src/app/api/__tests__/images.test.ts --reporter=verbose
      2. Assert: exit code 0
      3. Assert: tests for getFile, listFiles fallback, ETag, 304 all pass
    Expected Result: Image serving correctly uses storage adapter
    Evidence: Terminal output captured
  ```

  **Commit**: YES (groups with Task 9)
  - Message: `refactor(api): update image serving route to use storage adapter with S3 support`
  - Files: `src/app/api/images/[photoId]/[filename]/route.ts`, `src/app/api/__tests__/images.test.ts`
  - Pre-commit: `npx vitest run src/app/api/__tests__/images.test.ts`

---

- [ ] 11. Update image loader and component/page image URLs for CloudFront

  **What to do**:
  - **RED**: Write test for updated `imageLoader.ts`:
    - When `CLOUDFRONT_DOMAIN` env is set: returns `https://{domain}/processed/{photoId}/{width}w.webp`
    - When not set (local dev): returns `/api/images/{photoId}/{width}w.webp` (current behavior)
  - Update `src/lib/imageLoader.ts`:
    - Accept an env-based prefix for CloudFront domain
    - Since this runs client-side, it needs the domain injected differently — use `process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN`
    - If set: `https://${process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN}/processed${src}/${bestWidth}w.webp`
    - If not set: current behavior `${src}/${bestWidth}w.webp`
  - Add `NEXT_PUBLIC_CLOUDFRONT_DOMAIN` to env config (public env var for client-side use — this is separate from the server-side `AWS_CLOUDFRONT_DOMAIN` in env.ts)
  - Create a shared utility function for constructing image URLs server-side: `getImageUrl(photoId: string, filename: string): string`
    - When `STORAGE_BACKEND=s3`: `https://{AWS_CLOUDFRONT_DOMAIN}/processed/{photoId}/{filename}`
    - When filesystem: `/api/images/{photoId}/{filename}`
    - This was already planned in Task 6 as part of barrel exports — verify it exists and use it
  - Update **component files** that hardcode `/api/images/` URLs to use the shared utility:
    - `src/presentation/components/PhotoGrid.tsx:151` — thumbnail src
    - `src/presentation/components/SortablePhotoCard.tsx:59` — thumbnail src
    - `src/presentation/components/FadeImage.tsx:39` — Image src (uses imageLoader, may just need `src` prop change)
    - `src/presentation/components/PhotoLightbox.tsx:35,60` — srcSet + fallback
    - `src/app/admin/(protected)/albums/[id]/AlbumDetailClient.tsx:200` — preview thumbnail
  - Update **page files** with OG image URLs (server components — use server-side utility):
    - `src/app/photo/[slug]/page.tsx:42` — OG image must be absolute URL
    - `src/app/albums/page.tsx:80` — album cover image
    - `src/app/albums/[id]/page.tsx:42,53` — OG image
    - `src/app/albums/[id]/photo/[slug]/page.tsx:58` — OG image

  **Must NOT do**:
  - Do NOT change component logic, styling, or behavior — only the image URL construction
  - Do NOT change the FadeImage/PhotoGrid rendering logic
  - Do NOT add CloudFront domain configuration beyond the env var

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 10 files to update, careful URL pattern changes, client-side + server-side considerations
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Component file changes touching image rendering — needs awareness of Next.js Image component and custom loader behavior

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 10)
  - **Blocks**: Task 14
  - **Blocked By**: Task 2 (env config)

  **References**:

  **Pattern References**:
  - `src/lib/imageLoader.ts:1-16` — Current image loader (being updated)
  - `src/presentation/components/FadeImage.tsx:39` — How Image component uses src prop with custom loader
  - `src/presentation/components/PhotoGrid.tsx:151` — Hardcoded thumbnail URL pattern
  - `src/presentation/components/PhotoLightbox.tsx:35,60` — srcSet construction pattern

  **API/Type References**:
  - `src/infrastructure/storage/index.ts` — `getImageUrl(photoId, filename)` utility (created in Task 6)
  - `src/infrastructure/config/env.ts` — `AWS_CLOUDFRONT_DOMAIN` for server-side URL construction

  **Documentation References**:
  - Next.js custom image loader: receives `{ src, width, quality }`, returns URL string
  - `NEXT_PUBLIC_*` env vars are inlined at build time by Next.js

  **Why Each Reference Matters**:
  - `imageLoader.ts` is the central URL construction point for `<Image>` components — changing it affects all FadeImage usages
  - Component files show the exact lines with hardcoded URLs that need updating
  - `getImageUrl` utility allows server components to construct absolute CloudFront URLs for OG images

  **Acceptance Criteria**:
  - [ ] `imageLoader.ts` produces CloudFront URLs when `NEXT_PUBLIC_CLOUDFRONT_DOMAIN` is set
  - [ ] `imageLoader.ts` falls back to `/api/images/` URLs when env not set (local dev)
  - [ ] All 5 component files updated to use CloudFront-aware URL construction
  - [ ] All 4 page files updated with absolute CloudFront OG image URLs (server-side)
  - [ ] `NEXT_PUBLIC_CLOUDFRONT_DOMAIN` documented in env config
  - [ ] `npm run typecheck` → no new errors
  - [ ] `npm run build` → succeeds (components compile correctly)
  - [ ] `npx vitest run src/lib/__tests__/imageLoader.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Image loader produces correct URLs
    Tool: Bash (vitest)
    Preconditions: imageLoader.ts updated
    Steps:
      1. npx vitest run src/lib/__tests__/imageLoader.test.ts --reporter=verbose
      2. Assert: exit code 0
      3. Assert: "CloudFront URL" test passes
      4. Assert: "fallback to API" test passes
    Expected Result: Loader correctly switches between CDN and API URLs
    Evidence: Terminal output captured

  Scenario: All components compile with updated URLs
    Tool: Bash
    Preconditions: All component files updated
    Steps:
      1. npm run typecheck
      2. Assert: exit code 0
      3. npm run build
      4. Assert: exit code 0, no build errors
    Expected Result: All components compile successfully
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(cdn): update image loader and components to serve images via CloudFront`
  - Files: `src/lib/imageLoader.ts`, `src/lib/__tests__/imageLoader.test.ts`, `src/presentation/components/PhotoGrid.tsx`, `src/presentation/components/SortablePhotoCard.tsx`, `src/presentation/components/FadeImage.tsx`, `src/presentation/components/PhotoLightbox.tsx`, `src/app/admin/(protected)/albums/[id]/AlbumDetailClient.tsx`, `src/app/photo/[slug]/page.tsx`, `src/app/albums/page.tsx`, `src/app/albums/[id]/page.tsx`, `src/app/albums/[id]/photo/[slug]/page.tsx`
  - Pre-commit: `npm run typecheck && npm run build`

---

- [ ] 12. Update health check for S3 connectivity

  **What to do**:
  - **RED**: Write test for updated health check:
    - When `STORAGE_BACKEND=s3`: calls `adapter.fileExists()` on a sentinel key or uses S3 `HeadBucket`
    - When `STORAGE_BACKEND=filesystem`: existing `access()` behavior preserved
    - Returns `{ status: "healthy", checks: { database: ..., storage: ... } }` in both modes
  - Update `src/app/api/health/route.ts`:
    - Import `getStorageAdapter` and check adapter type
    - S3 mode: try `adapter.listFiles("health-check/")` or similar lightweight operation
    - Filesystem mode: keep existing `access()` check
  - **GREEN**: Tests pass

  **Must NOT do**:
  - Do NOT change the database health check
  - Do NOT change the response format

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file update, straightforward logic change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 14)
  - **Blocks**: Task 14
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `src/app/api/health/route.ts:1-38` — Full file being updated

  **API/Type References**:
  - `src/infrastructure/storage/index.ts` — `getStorageAdapter()` factory
  - `src/infrastructure/storage/types.ts` — `StorageAdapter` interface

  **Why Each Reference Matters**:
  - Health route is the exact file being modified — executor must preserve response format and database check

  **Acceptance Criteria**:
  - [ ] S3 mode: health check verifies S3 connectivity (not filesystem)
  - [ ] Filesystem mode: existing `access()` check preserved
  - [ ] Response format unchanged: `{ status: "healthy"|"unhealthy", checks: { database, storage } }`
  - [ ] `npx vitest run src/app/api/__tests__/health.test.ts` → PASS
  - [ ] `npm run typecheck` → no new errors

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Health check works for both backends
    Tool: Bash (vitest)
    Preconditions: Task 6 complete
    Steps:
      1. npx vitest run src/app/api/__tests__/health.test.ts --reporter=verbose
      2. Assert: exit code 0
      3. Assert: S3 backend test passes
      4. Assert: filesystem backend test passes
    Expected Result: Health check adapts to storage backend
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(health): update health check for S3 storage connectivity`
  - Files: `src/app/api/health/route.ts`, `src/app/api/__tests__/health.test.ts`
  - Pre-commit: `npx vitest run src/app/api/__tests__/health.test.ts`

---

- [ ] 13. Update Docker config for S3 deployment

  **What to do**:
  - Update `docker-compose.yml`:
    - **Web service**: Remove `./storage:/app/storage` volume mount, add AWS env vars
    - **Worker service**: Remove `./storage:/app/storage` volume mount, add AWS env vars, add tmpfs mount for `/tmp`
    - Keep `./data:/app/data` volumes (SQLite database)
    - Add environment variables: `STORAGE_BACKEND`, `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_DOMAIN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `NEXT_PUBLIC_CLOUDFRONT_DOMAIN`
    - Use `${VAR}` syntax for values (read from host env / `.env` file)
  - Optionally create a `docker-compose.s3.yml` override file for S3-specific config (to keep default docker-compose.yml working with filesystem for local dev)
    - Or: keep single file with `STORAGE_BACKEND` defaulting to `filesystem` — simpler

  **Must NOT do**:
  - Do NOT remove the Redis service
  - Do NOT change the `./data:/app/data` volume (SQLite database)
  - Do NOT change the web server port mapping
  - Do NOT change the Redis healthcheck configuration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Docker config update — well-scoped file edit
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12, 14)
  - **Blocks**: Task 14
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `docker-compose.yml:1-55` — Full file being updated

  **Why Each Reference Matters**:
  - Docker compose is being modified — executor must preserve Redis service, database volumes, and existing env vars

  **Acceptance Criteria**:
  - [ ] S3 env vars added to both web and worker services
  - [ ] `STORAGE_BACKEND` env var added (defaults to `filesystem` for backward compat)
  - [ ] `NEXT_PUBLIC_CLOUDFRONT_DOMAIN` added to web service
  - [ ] Storage volume mount removed or conditional
  - [ ] Worker service has tmpfs for `/tmp` (temp file processing)
  - [ ] `./data:/app/data` volumes preserved
  - [ ] Redis service unchanged
  - [ ] `docker compose config` → valid configuration (no errors)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Docker compose config is valid
    Tool: Bash
    Preconditions: docker-compose.yml updated
    Steps:
      1. docker compose config > /dev/null 2>&1
      2. Assert: exit code 0
    Expected Result: Valid docker compose configuration
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `chore(docker): add S3 storage backend config and remove filesystem volume dependency`
  - Files: `docker-compose.yml`
  - Pre-commit: `docker compose config > /dev/null`

---

- [ ] 14. Integration test and full regression check

  **What to do**:
  - Write an integration test that verifies the full upload→process→serve pipeline with mocked S3:
    - Mock `@aws-sdk/client-s3` at module level
    - Upload a file → verify it reaches S3 adapter's `saveFile`
    - Simulate worker processing → verify derivatives uploaded to S3
    - Verify `getImageUrl()` returns correct CloudFront URL
    - Verify image serving route can proxy from mocked S3
  - Run full regression suite:
    - `npx vitest run` — all tests pass
    - `npm run typecheck` — zero errors
    - `npm run build` — production build succeeds
    - `npm run lint` — no lint errors
  - Fix any failures found

  **Must NOT do**:
  - Do NOT use real AWS services in tests
  - Do NOT skip any existing test files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration test requires understanding of full pipeline, may need debugging
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 4, after all other tasks)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 8, 9, 10, 11, 12, 13

  **References**:

  **Pattern References**:
  - `src/app/api/__tests__/admin-photos.test.ts:1-50` — Existing integration test pattern (mocked auth, storage, jobs, real SQLite)
  - `vitest.config.ts:1-39` — Test configuration

  **Test References**:
  - All 13 existing test files — must all pass in regression

  **Why Each Reference Matters**:
  - `admin-photos.test.ts` shows the project's integration test pattern — follow same structure for the pipeline test
  - All existing tests must pass — regression is non-negotiable

  **Acceptance Criteria**:
  - [ ] Integration test file exists: `src/__tests__/integration/s3-pipeline.test.ts`
  - [ ] Test verifies upload → S3 save → worker download → process → S3 upload → URL generation
  - [ ] `npx vitest run src/__tests__/integration/s3-pipeline.test.ts` → PASS
  - [ ] `npx vitest run` → ALL tests pass (existing 13 + new tests)
  - [ ] `npm run typecheck` → zero errors
  - [ ] `npm run build` → succeeds
  - [ ] `npm run lint` → passes

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Full regression suite passes
    Tool: Bash
    Preconditions: All tasks 1-13 complete
    Steps:
      1. npx vitest run --reporter=verbose
      2. Assert: exit code 0
      3. Assert: all test files pass (0 failures)
      4. npm run typecheck
      5. Assert: exit code 0
      6. npm run build
      7. Assert: exit code 0
      8. npm run lint
      9. Assert: exit code 0
    Expected Result: All checks pass — project is in deployable state
    Evidence: Terminal output for each command captured

  Scenario: Integration test covers full S3 pipeline
    Tool: Bash (vitest)
    Preconditions: Integration test written
    Steps:
      1. npx vitest run src/__tests__/integration/s3-pipeline.test.ts --reporter=verbose
      2. Assert: exit code 0
      3. Assert: "upload saves to S3" test passes
      4. Assert: "worker downloads and processes" test passes
      5. Assert: "CloudFront URL generated" test passes
    Expected Result: End-to-end pipeline verified with mocked S3
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `test(integration): add S3 pipeline integration test and verify full regression`
  - Files: `src/__tests__/integration/s3-pipeline.test.ts`
  - Pre-commit: `npx vitest run && npm run typecheck && npm run build`

---

## Commit Strategy

| After Task | Message                                                     | Key Files                                      | Verification                      |
| ---------- | ----------------------------------------------------------- | ---------------------------------------------- | --------------------------------- |
| 1          | `feat(storage): define StorageAdapter interface`            | types.ts                                       | vitest                            |
| 2          | `feat(config): add AWS and storage backend env vars`        | env.ts                                         | vitest                            |
| 3          | `chore(deps): add AWS SDK S3 packages`                      | package.json                                   | typecheck                         |
| 4          | `feat(storage): implement S3 storage adapter`               | s3StorageAdapter.ts, s3Client.ts               | vitest                            |
| 5          | `refactor(storage): wrap filesystem into StorageAdapter`    | filesystemStorageAdapter.ts                    | vitest                            |
| 6          | `refactor(storage): add factory pattern and update exports` | factory.ts, index.ts                           | vitest (all)                      |
| 7          | `refactor(jobs): rename originalPath to originalKey`        | queues.ts, upload/route.ts, reprocess/route.ts | typecheck                         |
| 8          | `refactor(worker): S3 download/process/upload flow`         | imageProcessor.ts                              | vitest                            |
| 9+10       | `refactor(api): update routes for storage adapter`          | 5 route files                                  | vitest                            |
| 11         | `feat(cdn): CloudFront URLs in loader and components`       | imageLoader.ts, 9 component/page files         | build                             |
| 12         | `feat(health): S3 connectivity check`                       | health/route.ts                                | vitest                            |
| 13         | `chore(docker): S3 backend config`                          | docker-compose.yml                             | compose config                    |
| 14         | `test(integration): S3 pipeline integration test`           | s3-pipeline.test.ts                            | vitest + typecheck + build + lint |

---

## Success Criteria

### Verification Commands

```bash
npx vitest run                    # Expected: ALL tests pass (existing + new)
npm run typecheck                 # Expected: 0 errors
npm run build                     # Expected: successful production build
npm run lint                      # Expected: 0 errors
docker compose config > /dev/null # Expected: valid configuration
```

### Final Checklist

- [ ] `StorageAdapter` interface with S3 and filesystem implementations
- [ ] `STORAGE_BACKEND` env var switches between adapters
- [ ] Worker downloads/processes/uploads with temp file cleanup
- [ ] Image loader produces CloudFront URLs when configured
- [ ] All 10 component/page files produce CloudFront-aware image URLs
- [ ] `/api/images/` route works as S3 proxy fallback
- [ ] Health check verifies S3 or filesystem based on backend config
- [ ] Docker config updated for S3 deployment
- [ ] Zero regressions — all existing tests pass
- [ ] All "Must NOT Have" guardrails verified absent
