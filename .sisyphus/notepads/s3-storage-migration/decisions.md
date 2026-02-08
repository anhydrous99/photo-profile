# Decisions — S3 Storage Migration

> Architectural choices and trade-offs made during implementation.

---

## Task 2: Environment Config with AWS Variables & Conditional Validation

**Date:** 2026-02-08

### Decision: Zod `.superRefine()` for Conditional Validation

**Rationale:**
- Zod's `.superRefine()` allows cross-field validation logic after all individual field parsing
- Enables conditional requirement: S3 backend requires AWS vars; filesystem backend requires STORAGE_PATH
- Cleaner than multiple `.refine()` chains or custom validation logic

### Implementation Details

1. **STORAGE_BACKEND enum**: `z.enum(["s3", "filesystem"]).default("filesystem")`
   - Defaults to filesystem for backward compatibility
   - Explicit enum prevents typos and provides type safety

2. **AWS variables**: All optional at schema level
   - `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_DOMAIN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - Conditional validation in `.superRefine()` enforces requirements based on backend choice

3. **Conditional Logic in `.superRefine()`**:
   - If `STORAGE_BACKEND === "s3"`: Require AWS_REGION, AWS_S3_BUCKET, AWS_CLOUDFRONT_DOMAIN
   - If `STORAGE_BACKEND === "filesystem"`: Require STORAGE_PATH (already in schema)
   - Uses `ctx.addIssue()` with `ZodIssueCode.custom` for clear error messages

4. **Test Strategy**: TDD approach
   - Created 11 test cases covering all conditional scenarios
   - Tests verify both success and failure paths
   - All 232 tests pass (no regressions)

### Preserved Constraints

- Fail-fast behavior maintained: Invalid env vars throw at startup
- Two `eslint-disable` comments preserved (lines 88, 90) for NodeJS namespace augmentation
- No `@ts-ignore` or `as any` used

### CloudFront Domain Format

- Stored without protocol prefix (e.g., `d1234.cloudfront.net`)
- App adds `https://` when constructing URLs
- Allows flexibility for custom domains or CDN configurations

### Test Coverage

- Default behavior (filesystem backend)
- S3 backend with all required vars
- S3 backend missing each required var (3 tests)
- Filesystem backend with STORAGE_PATH
- Filesystem backend without STORAGE_PATH
- AWS optional fields (ACCESS_KEY_ID, SECRET_ACCESS_KEY)


## Task 7: BullMQ Job Interface Rename — `originalPath` → `originalKey`

**Date:** 2026-02-08

### Decision: Semantic Rename for S3 Compatibility

**Rationale:**
- `originalPath` implies filesystem semantics (e.g., `./storage/originals/photo-id/image.jpg`)
- `originalKey` is storage-agnostic: works for S3 keys (e.g., `photos/photo-id/original.jpg`) and filesystem paths
- Rename clarifies that the worker will receive either an S3 key or a filesystem path depending on `STORAGE_BACKEND`
- Enables Task 8 (worker update) to handle both backends transparently

### Implementation Details

1. **Interface Update** (`src/infrastructure/jobs/queues.ts:9-12`):
   - Renamed `ImageJobData.originalPath` → `ImageJobData.originalKey`
   - Updated JSDoc: "S3 key or filesystem path to the original uploaded image"

2. **Function Signature** (`src/infrastructure/jobs/queues.ts:71-81`):
   - Updated `enqueueImageProcessing(photoId, originalKey)` parameter name
   - Updated JSDoc to reflect S3 key semantics

3. **Callsite Updates**:
   - **Upload route** (`src/app/api/admin/upload/route.ts:108`): Passes `filePath` from `saveOriginalFile()` as `originalKey`
   - **Reprocess route** (`src/app/api/admin/photos/[id]/reprocess/route.ts:91`): Passes `originalPath` from `findOriginalFile()` as `originalKey`
   - Added clarifying comments: "originalKey is S3 key or filesystem path"

4. **Test Coverage** (`src/infrastructure/jobs/__tests__/queues.test.ts`):
   - Created 3 tests verifying `ImageJobData.originalKey` field
   - Tests verify S3 key format, filesystem path format, and absence of old `originalPath` property
   - All 257 tests pass (no regressions)

### Type Safety

- TypeScript enforces the rename at compile time
- Old code using `originalPath` will fail type checking
- Worker (Task 8) will receive `originalKey` and can handle both S3 and filesystem paths

### Preserved Constraints

- No changes to BullMQ queue configuration, retry logic, or job options
- Worker update deferred to Task 8 (intentional separation of concerns)
- No `@ts-ignore`, `@ts-expect-error`, or `as any` used

### Test Results

- New test file: `src/infrastructure/jobs/__tests__/queues.test.ts` (3 tests)
- All 257 existing tests pass
- No regressions introduced


## Task 13: Docker Compose Configuration for S3 Deployment

**Date:** 2026-02-08

### Decision: Environment-Driven Storage Backend Configuration

**Rationale:**
- Docker Compose uses `${VAR}` syntax to read environment variables from host or `.env` file
- `STORAGE_BACKEND` defaults to `filesystem` for backward compatibility
- Conditional volume mounts handled at deployment time (not in compose file)
- tmpfs for `/tmp` on worker reduces disk I/O during image processing

### Implementation Details

1. **Web Service Updates**:
   - Added `STORAGE_BACKEND=${STORAGE_BACKEND:-filesystem}` (defaults to filesystem)
   - Added AWS env vars: `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_DOMAIN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - Added `NEXT_PUBLIC_CLOUDFRONT_DOMAIN` for frontend image URL construction
   - Removed `./storage:/app/storage` volume mount (S3 backend doesn't need local storage)
   - Preserved `./data:/app/data` for SQLite database

2. **Worker Service Updates**:
   - Same AWS env vars as web service
   - Added `tmpfs: ["/tmp"]` for temporary file operations during image processing
   - Removed `./storage:/app/storage` volume mount
   - Preserved `./data:/app/data` for database access

3. **Redis Service**:
   - Unchanged (no S3 impact)
   - Healthcheck and configuration preserved

4. **Validation**:
   - `docker compose config` validates successfully
   - All env var references use `${VAR}` syntax (read from host environment)
   - Backward compatible: filesystem backend works without AWS vars

### Environment Variable Strategy

- **Required for S3**: AWS_REGION, AWS_S3_BUCKET, AWS_CLOUDFRONT_DOMAIN, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
- **Optional**: STORAGE_BACKEND (defaults to filesystem)
- **Frontend**: NEXT_PUBLIC_CLOUDFRONT_DOMAIN (passed to browser for image URLs)
- **Validation**: Handled by Zod schema in `src/infrastructure/config/env.ts` (Task 2)

### Deployment Notes

- For S3 deployment: Set `STORAGE_BACKEND=s3` and all AWS vars in `.env` or host environment
- For filesystem deployment: Omit AWS vars; `STORAGE_BACKEND` defaults to filesystem
- Worker tmpfs reduces memory pressure during concurrent image processing (concurrency=2)
- Database volume persists across container restarts

### Test Results

- Docker Compose config validation: ✓ Pass
- All services defined correctly
- Volume mounts correct (data preserved, storage removed)
- Environment variables properly referenced

