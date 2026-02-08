# Draft: Increase Upload Limit to 100MB

## Requirements (confirmed)

- Increase file upload limit from 25MB to 100MB
- Scope: Limit change + resource safety + UX improvements

## Size Limit Locations (3 hardcoded places)

1. `src/app/api/admin/upload/route.ts` — `MAX_FILE_SIZE = 25 * 1024 * 1024` (line 10), error messages (lines 41, 57)
2. `src/presentation/components/DropZone.tsx` — `maxSize = 25 * 1024 * 1024` (line 30), help text "up to 25MB each" (line 85)
3. `src/app/admin/(protected)/upload/page.tsx` — error text "exceeds 25MB limit" (line 91)

## Resource Risks Identified

### CRITICAL

- **Job enqueue timeout**: 2000ms (route.ts line 107) — too short for 100MB, could timeout before job is queued
- **formData parsing**: Buffers entire file in memory (~100MB heap spike per upload)

### HIGH

- **No Next.js route maxDuration**: Default 30s may be too short for 100MB on slow connections
- **Docker**: No memory limits in docker-compose.yml — risk of OOM kill under concurrent uploads

### MEDIUM

- **Multipart overhead**: Only 1MB allocated (route.ts line 11) — may be insufficient for 100MB
- **No XHR timeout**: Client-side upload can hang indefinitely on network issues
- **Worker memory**: 2 concurrent × ~400MB = ~800MB peak (up from ~288MB currently)

## Memory Profile at 100MB

- **Upload phase peak**: ~200MB (formData parsing + buffer)
- **Worker processing peak**: ~400MB (2 concurrent jobs)
- **Total system peak**: ~600MB (both happening at once)
- With 2GB Docker limits per container → 4× headroom ✓

## Technical Decisions

- Buffer-based upload approach is acceptable for 100MB (streaming only needed at 500MB+)
- Worker concurrency stays at 2 (sufficient headroom with Docker limits)
- Sharp cache remains disabled ✓

## Resolved Questions

- UX improvements: File size display in queue, estimated time remaining, upload timeout handling
- Configurability: Hardcode 100MB (no env var)
- Upload abort button: NOT requested — excluded

## Test Strategy Decision

- **Infrastructure exists**: NO
- **Automated tests**: NO (deferred to later)
- **Agent-Executed QA**: ALWAYS (primary verification for all tasks)

## Scope Boundaries

- INCLUDE: Limit change, timeout adjustments, memory safety, Docker limits, UX for large uploads
- EXCLUDE: Streaming upload rewrite, chunked uploads (overkill for 100MB)
