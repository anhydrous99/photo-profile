# Requirements: Photo Portfolio v1.2 Quality & Hardening

**Defined:** 2026-02-06
**Core Value:** Let the photos speak for themselves -- a clean, distraction-free experience where the photography is the focus

## v1 Requirements

Requirements for v1.2 milestone. Each maps to roadmap phases.

### Testing Infrastructure

- [ ] **TEST-01**: Vitest setup file mocks Next.js server APIs (server-only, cookies, headers, navigation, cache) so infrastructure imports do not crash
- [ ] **TEST-02**: Vitest setup file mocks IORedis so tests do not hang on Redis connections
- [ ] **TEST-03**: Test database helper creates in-memory SQLite with full migration chain matching production schema
- [ ] **TEST-04**: Test fixture images exist for Sharp/EXIF testing (tiny programmatically-generated images, not large files)
- [ ] **TEST-05**: Coverage reporting configured via @vitest/coverage-v8 targeting infrastructure layer

### Unit & Integration Testing

- [ ] **UNIT-01**: Repository integration tests verify CRUD operations with real in-memory SQLite (not mocked Drizzle)
- [ ] **UNIT-02**: Repository tests verify toDomain/toDatabase round-trip serialization including edge cases (null EXIF, Unicode filenames, zero dimensions)
- [ ] **UNIT-03**: Image service tests verify derivative generation logic with fixture images
- [ ] **UNIT-04**: Auth module tests verify JWT session creation, verification, and expiry
- [ ] **UNIT-05**: API route integration tests verify request validation, auth checks, and error responses

### Error Handling

- [ ] **ERR-01**: Root error.tsx catches unhandled errors with recovery UI and error logging
- [ ] **ERR-02**: Root global-error.tsx catches root layout errors with its own html/body tags
- [ ] **ERR-03**: Album detail error.tsx shows "Failed to load album" with retry button
- [ ] **ERR-04**: Admin error.tsx catches authenticated page errors without exposing stack traces
- [ ] **ERR-05**: Root not-found.tsx shows styled 404 with navigation back to site
- [ ] **ERR-06**: Loading.tsx files at key route segments prevent blank flash during navigation
- [ ] **ERR-07**: JSON.parse in repository toDomain() wrapped in try/catch returning null on corrupt data
- [ ] **ERR-08**: All API routes validate input with Zod (standardize the 3 routes currently using raw type assertions)
- [ ] **ERR-09**: All API routes have consistent try/catch with error logging and standard error response format
- [ ] **ERR-10**: Upload route enforces file size limit before reading file into memory
- [ ] **ERR-11**: Upload route logs Redis/queue failures instead of silently swallowing them

### Worker Resilience

- [ ] **WORK-01**: Admin can see photos stuck in "processing" or "error" status with filtering
- [ ] **WORK-02**: Admin can trigger reprocessing of failed photos
- [ ] **WORK-03**: Stale processing detection finds photos in "processing" status beyond a time threshold
- [ ] **WORK-04**: Worker DB status update is resilient to failures (moved to processor function or has retry logic)

### Performance & Production

- [ ] **PERF-01**: Performance baselines measured before optimization (Lighthouse on public pages, API response times)
- [ ] **PERF-02**: Bundle analysis configured via @next/bundle-analyzer with baseline recorded
- [ ] **PERF-03**: Health check endpoint (GET /api/health) verifies DB connectivity and storage access
- [ ] **PERF-04**: Structured logging utility replaces raw console.log with log levels and JSON output
- [ ] **PERF-05**: Targeted performance optimizations applied based on measurement data (e.g., WAL mode, ETag/304)

### Tech Debt

- [ ] **DEBT-01**: FK constraint on albums.coverPhotoId verified to have ON DELETE SET NULL (fix if missing)
- [ ] **DEBT-02**: Schema drift reconciled -- Drizzle schema matches actual database tables (tags column, etc.)
- [ ] **DEBT-03**: Stale comments fixed (imageProcessor.ts JPEG reference, any other misleading comments)

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### End-to-End Testing

- **E2E-01**: Playwright configured with test seed script for deterministic data
- **E2E-02**: E2E smoke tests cover critical user flows (login, upload, album creation, gallery)
- **E2E-03**: CI pipeline runs lint + typecheck + tests on push/PR

### Advanced Quality

- **QUAL-01**: Application service layer extracted where business logic duplication warrants it
- **QUAL-02**: Full observability stack (error tracking service integration)
- **QUAL-03**: Database migration framework adoption

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                            | Reason                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| 100% test coverage target          | Focus on high-value infrastructure tests, not coverage metrics                         |
| Sentry/Datadog integration         | Self-hosted single-admin app -- structured logging sufficient                          |
| Comprehensive E2E suite            | 3-5 smoke tests deferred to v2; high setup cost, low ROI until unit tests exist        |
| Component-level React testing      | Presentation layer deferred -- test infrastructure and API layers first                |
| Database migration framework       | Fix FK constraint with targeted ALTER TABLE; defer migration tooling                   |
| Application service layer refactor | Empty layer is acceptable at current complexity; add services when duplication emerges |
| Rate limiting on all API routes    | Login rate limiting exists; admin routes require auth; low threat model                |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| TEST-01     | 15    | Pending |
| TEST-02     | 15    | Pending |
| TEST-03     | 15    | Pending |
| TEST-04     | 15    | Pending |
| TEST-05     | 15    | Pending |
| UNIT-01     | 17    | Pending |
| UNIT-02     | 17    | Pending |
| UNIT-03     | 17    | Pending |
| UNIT-04     | 17    | Pending |
| UNIT-05     | 17    | Pending |
| ERR-01      | 16    | Pending |
| ERR-02      | 16    | Pending |
| ERR-03      | 16    | Pending |
| ERR-04      | 16    | Pending |
| ERR-05      | 16    | Pending |
| ERR-06      | 16    | Pending |
| ERR-07      | 16    | Pending |
| ERR-08      | 16    | Pending |
| ERR-09      | 16    | Pending |
| ERR-10      | 16    | Pending |
| ERR-11      | 16    | Pending |
| WORK-01     | 18    | Pending |
| WORK-02     | 18    | Pending |
| WORK-03     | 18    | Pending |
| WORK-04     | 18    | Pending |
| PERF-01     | 19    | Pending |
| PERF-02     | 19    | Pending |
| PERF-03     | 19    | Pending |
| PERF-04     | 19    | Pending |
| PERF-05     | 19    | Pending |
| DEBT-01     | 18    | Pending |
| DEBT-02     | 18    | Pending |
| DEBT-03     | 18    | Pending |

**Coverage:**

- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---

_Requirements defined: 2026-02-06_
_Last updated: 2026-02-06 after roadmap creation_
