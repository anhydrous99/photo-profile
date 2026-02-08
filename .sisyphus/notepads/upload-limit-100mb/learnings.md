# Learnings - Upload Limit 100MB

## Conventions & Patterns

(Tasks will append findings here)

## Docker Memory Limits (Wave 1)

**Task**: Add memory limits to docker-compose.yml for safe 100MB upload handling.

**Implementation**:

- Added `mem_limit: 2g` to web service (line 19)
- Added `mem_limit: 2g` to worker service (line 37)
- Added `mem_limit: 512m` to redis service (line 51)

**Rationale**:

- Web service: 2GB provides 6× headroom for ~300MB peak during 100MB upload
- Worker service: 2GB provides 5× headroom for Sharp image processing (2 concurrent jobs @ ~400MB peak)
- Redis service: 512MB is generous for job queue metadata only

**Verification**:

- `grep -n "mem_limit" docker-compose.yml` returns 3 matches with correct values
- `docker compose config --quiet` validates YAML syntax successfully
- Commit: c871c38 (chore(docker): add memory limits for upload safety)

**Key Learning**: YAML indentation in docker-compose.yml must be consistent (2 spaces per level). Using Edit tool requires careful context matching to preserve indentation.

## File Size Limit Update (Wave 1)

**Task**: Update all size limit constants, defaults, and UI text from 25MB to 100MB across 3 files (7 total locations).

**Implementation**:

- `src/app/api/admin/upload/route.ts`:
  - Line 10: `MAX_FILE_SIZE = 100 * 1024 * 1024` (constant)
  - Line 41: Error message "File exceeds 100MB limit" (content-length check)
  - Line 57: Error message "File exceeds 100MB limit" (file size check)

- `src/presentation/components/DropZone.tsx`:
  - Line 23: JSDoc `@param maxSize - Maximum file size in bytes (default: 100MB)`
  - Line 30: Default parameter `maxSize = 100 * 1024 * 1024`
  - Line 85: UI help text "JPEG, PNG, WebP, HEIC up to 100MB each"

- `src/app/admin/(protected)/upload/page.tsx`:
  - Line 91: Error reason "exceeds 100MB limit"

**Verification**:

- `grep -rn "25MB\|25 \* 1024 \* 1024" src/` returns no matches ✓
- All 7 locations verified with grep for "100MB" or "100 _ 1024 _ 1024" ✓
- Pre-commit hooks (eslint, prettier) passed successfully ✓
- Commit: 37db34c (chore(upload): increase file size limit from 25MB to 100MB)

**Key Learning**: The project uses a pre-commit hook (lint-staged) that auto-formats files. All 3 modified files passed linting without issues. No additional formatting was needed.
