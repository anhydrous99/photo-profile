# Increase Upload Limit from 25MB to 100MB

## TL;DR

> **Quick Summary**: Increase file upload limit from 25MB to 100MB across the full stack — client validation, API route, error messages — while hardening timeouts and resource limits to safely handle 4× larger files, and adding UX improvements (estimated time remaining, upload timeout handling) for large uploads.
>
> **Deliverables**:
>
> - All size limit constants and UI text updated from 25MB to 100MB (7 locations across 3 files)
> - Server-side timeout and overhead adjustments for 100MB uploads
> - Client-side XHR timeout with graceful error handling
> - Docker memory limits for production safety
> - Estimated time remaining display during uploads
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 4

---

## Context

### Original Request

Increase the upload file size limit from 25MB to 100MB, ensuring the system can safely handle these larger files with proper resource management and improved upload UX.

### Interview Summary

**Key Discussions**:

- **Scope**: Full scope — limit change + resource safety + UX improvements
- **Configurability**: Hardcode 100MB (no environment variable)
- **UX priorities**: File size display (already exists!), estimated time remaining, upload timeout handling
- **Upload abort button**: Explicitly excluded from scope
- **Test strategy**: No automated tests (deferred); agent-executed QA only

**Research Findings**:

- 25MB limit is hardcoded in **7 locations across 3 files** (constants, defaults, JSDoc, UI text, error messages)
- Job enqueue timeout (2000ms) is critically too short — will timeout before job is queued for large files on slow Redis
- `maxDuration` is a no-op on self-hosted (standalone output) — still add for future-proofing but don't rely on it
- Upload pipeline is fully buffer-based (~300MB peak memory per 100MB upload) — acceptable at this scale, streaming only needed at 500MB+
- Worker memory peak: ~800MB for 2 concurrent 100MB files — safe within 2GB Docker limits
- File size display in upload queue **already implemented** in `UploadQueue.tsx:65-67`

### Metis Review

**Identified Gaps** (addressed):

- **7 locations, not 3**: Found additional JSDoc comment and error message references — all included in Task 1
- **File size display already exists**: Removed from deliverables — already in `UploadQueue.tsx:65-67` via `formatFileSize()`
- **`maxDuration` is a no-op on self-hosted**: Still adding for Vercel compatibility, but not relying on it
- **Triple-buffering memory (~300MB per upload)**: Acceptable at 100MB scale; streaming rewrite excluded from scope
- **ETA algorithm needs specification**: Defined rolling average approach with display rules

---

## Work Objectives

### Core Objective

Safely increase the maximum upload file size from 25MB to 100MB with proper timeout hardening, resource limits, and upload UX improvements for large files.

### Concrete Deliverables

- Updated `MAX_FILE_SIZE` constant and all associated text/messages in `route.ts`, `DropZone.tsx`, `upload/page.tsx`
- Increased job enqueue timeout from 2000ms → 10000ms in `route.ts`
- Increased multipart overhead from 1MB → 5MB in `route.ts`
- XHR upload timeout (10 minutes) with `ontimeout` error handling in `uploadFile.ts`
- Docker memory limits in `docker-compose.yml` (web: 2GB, worker: 2GB, redis: 512MB)
- Estimated time remaining display in `UploadQueue.tsx` during active uploads

### Definition of Done

- [ ] All "25MB" references replaced with "100MB" across the codebase
- [ ] 100MB file uploads succeed end-to-end (upload → processing → ready)
- [ ] XHR timeout fires after 10 minutes with clear error message
- [ ] Estimated time remaining displays during upload and updates smoothly
- [ ] Docker containers have memory limits configured
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes

### Must Have

- All 7 size limit references updated consistently
- Job enqueue timeout increased to handle large file scenarios
- XHR timeout with user-facing error message
- ETA display during uploads

### Must NOT Have (Guardrails)

- Do NOT convert to streaming upload (overkill for 100MB; only needed at 500MB+)
- Do NOT implement chunked uploads
- Do NOT add environment variable for file size (user chose hardcoded)
- Do NOT add upload abort button (explicitly excluded)
- Do NOT change worker concurrency (stays at 2)
- Do NOT modify Sharp pipeline (`.rotate()` + `.withMetadata()` are critical)
- Do NOT add `@ts-ignore`, `@ts-expect-error`, or `as any`

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> Every criterion MUST be verifiable by running a command or using a tool.

### Test Decision

- **Infrastructure exists**: NO
- **Automated tests**: NO (deferred)
- **Framework**: None
- **Agent-Executed QA**: ALWAYS (primary verification for all tasks)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

> QA scenarios are the PRIMARY verification method for this plan.
> The executing agent will directly verify each deliverable by running it.

**Verification Tool by Deliverable Type:**

| Type                               | Tool        | How Agent Verifies                                                            |
| ---------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| **Code changes (constants, text)** | Bash (grep) | Search for old values, confirm absent; search for new values, confirm present |
| **Upload UI**                      | Playwright  | Navigate to upload page, verify text, upload file, check progress/ETA         |
| **API behavior**                   | Bash (curl) | Send oversized request, verify 413; send valid request, verify 201            |
| **Docker config**                  | Bash (grep) | Verify memory limits present in docker-compose.yml                            |
| **Build/lint/typecheck**           | Bash        | Run `npm run build`, `npm run lint`, `npm run typecheck`                      |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Update all size limits and error messages (3 files, 7 locations)
└── Task 2: Add Docker memory limits (docker-compose.yml)

Wave 2 (After Wave 1):
├── Task 3: Harden timeouts (API route + XHR client)
└── Task 4: Add estimated time remaining to upload queue

Wave 3 (After Wave 2):
└── Task 5: Build verification + end-to-end QA

Critical Path: Task 1 → Task 3 → Task 5
Parallel Speedup: ~40% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| ---- | ---------- | ------ | -------------------- |
| 1    | None       | 3, 5   | 2                    |
| 2    | None       | 5      | 1                    |
| 3    | 1          | 5      | 4                    |
| 4    | None       | 5      | 3                    |
| 5    | 1, 2, 3, 4 | None   | None (final)         |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents                                                                            |
| ---- | ----- | --------------------------------------------------------------------------------------------- |
| 1    | 1, 2  | task(category="quick", ...) — simple constant/config changes                                  |
| 2    | 3, 4  | task(category="quick", ...) for timeouts; task(category="visual-engineering", ...) for ETA UX |
| 3    | 5     | task(category="unspecified-low", load_skills=["playwright"], ...) for full QA                 |

---

## TODOs

- [ ] 1. Update all size limit constants, defaults, and UI text from 25MB to 100MB

  **What to do**:
  - Change `MAX_FILE_SIZE` from `25 * 1024 * 1024` to `100 * 1024 * 1024` in `route.ts:10`
  - Change error message on `route.ts:41` from `"File exceeds 25MB limit"` to `"File exceeds 100MB limit"`
  - Change error message on `route.ts:57` from `"File exceeds 25MB limit"` to `"File exceeds 100MB limit"`
  - Change default `maxSize` parameter from `25 * 1024 * 1024` to `100 * 1024 * 1024` in `DropZone.tsx:30`
  - Update JSDoc comment from `"25MB"` to `"100MB"` in `DropZone.tsx:23`
  - Change help text from `"up to 25MB each"` to `"up to 100MB each"` in `DropZone.tsx:85`
  - Change error reason from `"exceeds 25MB limit"` to `"exceeds 100MB limit"` in `upload/page.tsx:91`

  **Must NOT do**:
  - Do NOT change any other constants (MULTIPART_OVERHEAD is handled in Task 3)
  - Do NOT modify file type restrictions
  - Do NOT refactor the validation logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple find-and-replace across 3 files, no logic changes
  - **Skills**: []
    - No special skills needed — basic text editing
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — no design changes, just text updates

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 5
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/app/api/admin/upload/route.ts:10` — `MAX_FILE_SIZE = 25 * 1024 * 1024` constant to change
  - `src/app/api/admin/upload/route.ts:41` — First error message string `"File exceeds 25MB limit"`
  - `src/app/api/admin/upload/route.ts:57` — Second error message string `"File exceeds 25MB limit"`
  - `src/presentation/components/DropZone.tsx:23` — JSDoc `@param maxSize` comment mentioning `25MB`
  - `src/presentation/components/DropZone.tsx:30` — Default parameter `maxSize = 25 * 1024 * 1024`
  - `src/presentation/components/DropZone.tsx:85` — UI text `"JPEG, PNG, WebP, HEIC up to 25MB each"`
  - `src/app/admin/(protected)/upload/page.tsx:91` — Error reason `"exceeds 25MB limit"`

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: No references to 25MB remain in source code
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -rn "25MB\|25 \* 1024 \* 1024" src/ --include="*.ts" --include="*.tsx"
      2. Assert: No matches found (exit code 1, empty output)
    Expected Result: Zero occurrences of "25MB" or "25 * 1024 * 1024" in source
    Failure Indicators: Any grep match
    Evidence: Command output captured

  Scenario: All new 100MB references are present
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "100 \* 1024 \* 1024" src/app/api/admin/upload/route.ts
      2. Assert: Line 10 contains "100 * 1024 * 1024"
      3. Run: grep -n "100MB" src/app/api/admin/upload/route.ts
      4. Assert: Lines 41 and 57 contain "100MB"
      5. Run: grep -n "100 \* 1024 \* 1024" src/presentation/components/DropZone.tsx
      6. Assert: Line 30 contains "100 * 1024 * 1024"
      7. Run: grep -n "100MB" src/presentation/components/DropZone.tsx
      8. Assert: Lines 23 and 85 contain "100MB"
      9. Run: grep -n "100MB" src/app/admin/\(protected\)/upload/page.tsx
      10. Assert: Line 91 contains "100MB"
    Expected Result: All 7 locations updated to 100MB
    Failure Indicators: Missing matches at expected lines
    Evidence: Command output captured

  Scenario: TypeScript compiles without errors
    Tool: Bash
    Preconditions: Dependencies installed
    Steps:
      1. Run: npm run typecheck
      2. Assert: Exit code 0
    Expected Result: No type errors
    Failure Indicators: Non-zero exit code or error output
    Evidence: Command output captured
  ```

  **Commit**: YES
  - Message: `chore(upload): increase file size limit from 25MB to 100MB`
  - Files: `src/app/api/admin/upload/route.ts`, `src/presentation/components/DropZone.tsx`, `src/app/admin/(protected)/upload/page.tsx`
  - Pre-commit: `npm run typecheck`

---

- [ ] 2. Add Docker memory limits to docker-compose.yml

  **What to do**:
  - Add `mem_limit: 2g` to the `web` service
  - Add `mem_limit: 2g` to the `worker` service
  - Add `mem_limit: 512m` to the `redis` service

  **Must NOT do**:
  - Do NOT change any other Docker configuration (ports, volumes, commands, env vars)
  - Do NOT add CPU limits (not requested)
  - Do NOT modify the healthcheck configuration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit, adding 3 lines to YAML
  - **Skills**: []
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `docker-compose.yml:1-18` — `web` service definition — add `mem_limit: 2g` after `restart: unless-stopped` (line 18)
  - `docker-compose.yml:20-35` — `worker` service definition — add `mem_limit: 2g` after `restart: unless-stopped` (line 35)
  - `docker-compose.yml:37-48` — `redis` service definition — add `mem_limit: 512m` after the `healthcheck` block (line 48)

  **WHY Each Reference Matters**:
  - Web service handles upload buffering (~300MB peak per 100MB upload) — 2GB gives 6× headroom
  - Worker processes images with Sharp (~400MB peak for 2 concurrent 100MB files) — 2GB gives 5× headroom
  - Redis stores job queue metadata only (not file data) — 512MB is generous

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: Memory limits present in docker-compose.yml
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "mem_limit" docker-compose.yml
      2. Assert: 3 matches found
      3. Assert: One line contains "2g" under web service
      4. Assert: One line contains "2g" under worker service
      5. Assert: One line contains "512m" under redis service
    Expected Result: All 3 services have memory limits
    Failure Indicators: Fewer than 3 matches or wrong values
    Evidence: Command output captured

  Scenario: docker-compose.yml is valid YAML
    Tool: Bash
    Preconditions: docker compose available
    Steps:
      1. Run: docker compose config --quiet 2>&1 || echo "docker not available - skip"
      2. If docker available: Assert exit code 0
      3. If docker not available: Skip gracefully
    Expected Result: Valid YAML syntax (or graceful skip if no Docker)
    Failure Indicators: YAML parse error
    Evidence: Command output captured
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `chore(docker): add memory limits for upload safety`
  - Files: `docker-compose.yml`
  - Pre-commit: None

---

- [ ] 3. Harden timeouts for 100MB uploads (API route + XHR client)

  **What to do**:
  - **API route (`route.ts`):**
    - Increase `MULTIPART_OVERHEAD` from `1 * 1024 * 1024` (1MB) to `5 * 1024 * 1024` (5MB) on line 11
    - Increase job enqueue timeout from `2000` to `10000` (10 seconds) on line 107
    - Add `export const maxDuration = 300;` at the top of the file (after imports, before constants) — future-proofing for Vercel/serverless deployments (no-op on self-hosted standalone)
  - **XHR upload utility (`uploadFile.ts`):**
    - Add `xhr.timeout = 600000;` (10 minutes) before `xhr.send()` on line 85
    - Add `xhr.addEventListener("timeout", ...)` handler that rejects with a clear error message: `"Upload timed out — the file may be too large for your connection speed. Please try again."`

  **Must NOT do**:
  - Do NOT change the XHR to fetch (fetch doesn't support upload progress)
  - Do NOT add retry logic (out of scope)
  - Do NOT change the abort handler (already works correctly)
  - Do NOT modify the progress tracking logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, targeted changes in 2 files — constants and event handler
  - **Skills**: []
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — no visual changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1 (same file — `route.ts`)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/app/api/admin/upload/route.ts:11` — `MULTIPART_OVERHEAD = 1 * 1024 * 1024` — change to `5 * 1024 * 1024`
  - `src/app/api/admin/upload/route.ts:104-108` — Job enqueue timeout `Promise.race` with `setTimeout(..., 2000)` — change to `10000`
  - `src/presentation/lib/uploadFile.ts:73-81` — Existing error/abort event handlers — follow this pattern for new `timeout` handler
  - `src/presentation/lib/uploadFile.ts:83-85` — `xhr.open()` and `xhr.send()` — insert `xhr.timeout` between these

  **WHY Each Reference Matters**:
  - `MULTIPART_OVERHEAD`: At 100MB, multipart boundaries + headers can exceed 1MB. 5MB gives safe margin.
  - Job enqueue timeout: Redis may be slow under load; 2s is too tight for any network hiccup. 10s is generous.
  - `maxDuration`: Self-hosted standalone ignores this, but if ever deployed to Vercel/serverless, 300s prevents premature termination.
  - XHR timeout: 100MB on a 1.5Mbps connection takes ~9 minutes. 10-minute timeout prevents indefinite hangs while allowing slow connections.

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: Multipart overhead increased to 5MB
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "MULTIPART_OVERHEAD" src/app/api/admin/upload/route.ts
      2. Assert: Contains "5 * 1024 * 1024"
      3. Assert: Does NOT contain "1 * 1024 * 1024"
    Expected Result: Overhead increased to 5MB
    Evidence: Command output captured

  Scenario: Job enqueue timeout increased to 10 seconds
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "Job enqueue timeout" src/app/api/admin/upload/route.ts
      2. Assert: Same line or adjacent line contains "10000"
      3. Assert: Does NOT contain "2000"
    Expected Result: Timeout is 10000ms
    Evidence: Command output captured

  Scenario: maxDuration export exists in upload route
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "maxDuration" src/app/api/admin/upload/route.ts
      2. Assert: Contains "export const maxDuration = 300"
    Expected Result: maxDuration configured for 5 minutes
    Evidence: Command output captured

  Scenario: XHR timeout configured in uploadFile.ts
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "timeout" src/presentation/lib/uploadFile.ts
      2. Assert: Contains "xhr.timeout = 600000"
      3. Assert: Contains "timeout" event listener
    Expected Result: 10-minute timeout with handler
    Evidence: Command output captured

  Scenario: TypeScript compiles without errors
    Tool: Bash
    Preconditions: Dependencies installed
    Steps:
      1. Run: npm run typecheck
      2. Assert: Exit code 0
    Expected Result: No type errors
    Evidence: Command output captured
  ```

  **Commit**: YES
  - Message: `fix(upload): harden timeouts for 100MB file uploads`
  - Files: `src/app/api/admin/upload/route.ts`, `src/presentation/lib/uploadFile.ts`
  - Pre-commit: `npm run typecheck`

---

- [ ] 4. Add estimated time remaining to upload queue

  **What to do**:
  - Extend the `UploadItem` interface in `UploadQueue.tsx` to include an optional `startedAt?: number` and `estimatedSecondsRemaining?: number` field
  - In `upload/page.tsx`, when updating an item's status to `"uploading"`, also set `startedAt: Date.now()`
  - In `upload/page.tsx`, within the `onProgress` callback, calculate ETA using a **rolling speed average**:
    - Track `bytesUploaded = (percent / 100) * file.size` and `elapsedMs = Date.now() - startedAt`
    - Calculate `speedBps = bytesUploaded / (elapsedMs / 1000)`
    - Calculate `remainingBytes = file.size - bytesUploaded`
    - Calculate `estimatedSecondsRemaining = remainingBytes / speedBps`
    - Only set `estimatedSecondsRemaining` after progress ≥ 10% (too noisy before that)
  - In `UploadQueue.tsx`, display ETA below the progress percentage when `item.status === "uploading"` and `estimatedSecondsRemaining` is defined:
    - Format as `"~X min remaining"` if ≥ 60s, or `"~X sec remaining"` if < 60s
    - Use `text-xs text-text-tertiary` styling (matches existing file size text)

  **Must NOT do**:
  - Do NOT use a complex rolling window algorithm (simple elapsed-based calculation is sufficient)
  - Do NOT show ETA when progress < 10% (too unreliable)
  - Do NOT show ETA for files under 5MB (too fast to matter)
  - Do NOT add any external dependencies
  - Do NOT modify the existing `formatFileSize()` function
  - Do NOT change the progress bar styling or layout structure

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI feature with display logic — needs attention to layout and text formatting
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: ETA display is a UX enhancement requiring thoughtful placement and formatting
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed during implementation — QA is in Task 5

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: None (different files from Task 1, except `upload/page.tsx` — but changes are in different sections)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/presentation/components/UploadQueue.tsx:6-18` — `UploadItem` interface — extend with `startedAt?` and `estimatedSecondsRemaining?`
  - `src/presentation/components/UploadQueue.tsx:76-87` — Existing `uploading` status display with progress bar and percentage — add ETA text below `{item.progress}%`
  - `src/presentation/components/UploadQueue.tsx:65-67` — Existing file size display pattern (`text-xs text-text-tertiary`) — follow same styling for ETA
  - `src/presentation/components/UploadQueue.tsx:112-116` — `formatFileSize()` utility — reference for formatting helper pattern (create similar `formatETA()`)
  - `src/app/admin/(protected)/upload/page.tsx:40-44` — Where item status changes to `"uploading"` — add `startedAt: Date.now()` here
  - `src/app/admin/(protected)/upload/page.tsx:47-51` — Progress callback where `setItems` is called — add ETA calculation logic here

  **WHY Each Reference Matters**:
  - `UploadItem` interface: Must extend to carry timing data from page to queue component
  - Uploading display block: Exact location to render the ETA text
  - File size styling: Ensures visual consistency with existing text
  - `formatFileSize` pattern: Shows how this codebase creates formatting utilities
  - Status change to uploading: Where to capture `startedAt` timestamp
  - Progress callback: Where speed calculation happens with access to `percent` and `file.size`

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: UploadItem interface includes new fields
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "startedAt" src/presentation/components/UploadQueue.tsx
      2. Assert: Contains "startedAt?: number"
      3. Run: grep -n "estimatedSecondsRemaining" src/presentation/components/UploadQueue.tsx
      4. Assert: Contains "estimatedSecondsRemaining?: number"
    Expected Result: Both new fields present in UploadItem interface
    Evidence: Command output captured

  Scenario: ETA calculation exists in upload page
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "estimatedSecondsRemaining\|startedAt\|speedBps\|remainingBytes" src/app/admin/\(protected\)/upload/page.tsx
      2. Assert: Contains ETA calculation logic
      3. Assert: Contains threshold check (10% or similar)
    Expected Result: ETA calculation with threshold gate
    Evidence: Command output captured

  Scenario: ETA display renders in upload queue
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "remaining\|formatETA\|estimatedSeconds" src/presentation/components/UploadQueue.tsx
      2. Assert: Contains rendering logic for time remaining
      3. Assert: Contains "min remaining" or "sec remaining" text
    Expected Result: ETA display logic present
    Evidence: Command output captured

  Scenario: TypeScript compiles without errors
    Tool: Bash
    Preconditions: Dependencies installed
    Steps:
      1. Run: npm run typecheck
      2. Assert: Exit code 0
    Expected Result: No type errors
    Evidence: Command output captured
  ```

  **Commit**: YES
  - Message: `feat(upload): add estimated time remaining during file uploads`
  - Files: `src/presentation/components/UploadQueue.tsx`, `src/app/admin/(protected)/upload/page.tsx`
  - Pre-commit: `npm run typecheck`

---

- [ ] 5. Build verification and end-to-end QA

  **What to do**:
  - Run full build pipeline: `npm run typecheck && npm run lint && npm run build`
  - Fix any errors that arise from Tasks 1-4
  - Run end-to-end QA via Playwright: verify upload page shows "100MB", test file upload with progress and ETA display
  - Verify the API rejects files over 100MB with proper error message
  - Verify proxy doesn't interfere with large uploads (test with >25MB file to confirm no silent truncation)

  **Must NOT do**:
  - Do NOT modify any code unless fixing build/lint errors from previous tasks
  - Do NOT add new features
  - Do NOT change test configurations

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Verification task — running commands and Playwright checks, no creative work
  - **Skills**: [`playwright`]
    - `playwright`: Needed for browser-based upload page verification
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — only verifying, not designing
    - `git-master`: Not needed — no commits in this task

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final, sequential)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References** (CRITICAL):

  **Pattern References**:
  - `src/app/admin/(protected)/upload/page.tsx` — Full upload page to verify in browser
  - `src/presentation/components/DropZone.tsx:85` — Should display "up to 100MB each"
  - `src/app/api/admin/upload/route.ts:10` — MAX_FILE_SIZE should be 100MB
  - `package.json` — Build/lint/typecheck commands: `npm run build`, `npm run lint`, `npm run typecheck`
  - `src/infrastructure/auth/session.ts` — Auth flow for getting admin session (needed for Playwright login)
  - `src/app/admin/login/page.tsx` — Login page to authenticate before upload testing

  **WHY Each Reference Matters**:
  - Upload page: Primary UI to verify all changes render correctly
  - DropZone text: Confirms user-facing limit text is correct
  - route.ts constant: Confirms API enforces new limit
  - Package.json: Commands to verify project builds cleanly
  - Auth flow: Must authenticate as admin before accessing upload page in Playwright

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: Project builds successfully
    Tool: Bash
    Preconditions: Dependencies installed (npm install)
    Steps:
      1. Run: npm run typecheck
      2. Assert: Exit code 0
      3. Run: npm run lint
      4. Assert: Exit code 0
      5. Run: npm run build
      6. Assert: Exit code 0
    Expected Result: All three pass with zero errors
    Failure Indicators: Non-zero exit code or error output
    Evidence: Command output captured

  Scenario: Upload page displays 100MB limit text
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on localhost:3000, admin logged in
    Steps:
      1. Navigate to: http://localhost:3000/admin/login
      2. Fill: input[type="password"] with admin password
      3. Click: button[type="submit"]
      4. Wait for: navigation to /admin (timeout: 5s)
      5. Navigate to: http://localhost:3000/admin/upload
      6. Wait for: text "up to 100MB each" visible (timeout: 5s)
      7. Assert: Page contains text "up to 100MB each"
      8. Assert: Page does NOT contain text "25MB"
      9. Screenshot: .sisyphus/evidence/task-5-upload-page-100mb.png
    Expected Result: Upload page shows 100MB limit
    Evidence: .sisyphus/evidence/task-5-upload-page-100mb.png

  Scenario: API rejects file over 100MB via content-length
    Tool: Bash (curl)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Get session cookie by logging in via curl
      2. Run: curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/admin/upload \
           -H "Content-Length: 110000000" \
           -H "Cookie: session=<token>" \
           -F "file=@/dev/null"
      3. Assert: HTTP status is 413
    Expected Result: Oversized upload rejected with 413
    Failure Indicators: Status other than 413
    Evidence: Response captured

  Scenario: No references to old 25MB limit remain
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -rn "25MB\|25 \* 1024 \* 1024" src/ --include="*.ts" --include="*.tsx"
      2. Assert: No matches found (exit code 1)
      3. Run: grep -rn "2000\b" src/app/api/admin/upload/route.ts
      4. Assert: No matches (old timeout gone)
    Expected Result: All old values replaced
    Evidence: Command output captured
  ```

  **Evidence to Capture:**
  - [ ] Screenshots in .sisyphus/evidence/ for UI scenarios
  - [ ] Terminal output for build/lint/typecheck
  - [ ] Response bodies for API scenarios
  - [ ] Each evidence file named: task-5-{scenario-slug}.{ext}

  **Commit**: NO (verification only — no code changes unless fixing build errors, in which case commit with `fix(upload): resolve build errors from limit increase`)

---

## Commit Strategy

| After Task | Message                                                          | Files                                   | Verification                       |
| ---------- | ---------------------------------------------------------------- | --------------------------------------- | ---------------------------------- |
| 1          | `chore(upload): increase file size limit from 25MB to 100MB`     | route.ts, DropZone.tsx, upload/page.tsx | npm run typecheck                  |
| 2          | `chore(docker): add memory limits for upload safety`             | docker-compose.yml                      | grep for mem_limit                 |
| 3          | `fix(upload): harden timeouts for 100MB file uploads`            | route.ts, uploadFile.ts                 | npm run typecheck                  |
| 4          | `feat(upload): add estimated time remaining during file uploads` | UploadQueue.tsx, upload/page.tsx        | npm run typecheck                  |
| 5          | None (verification only)                                         | —                                       | npm run build && lint && typecheck |

---

## Success Criteria

### Verification Commands

```bash
npm run typecheck    # Expected: exit 0
npm run lint         # Expected: exit 0
npm run build        # Expected: exit 0

# Confirm no old values remain
grep -rn "25MB\|25 \* 1024 \* 1024" src/ --include="*.ts" --include="*.tsx"
# Expected: no matches

# Confirm new values present
grep -rn "100 \* 1024 \* 1024\|100MB" src/ --include="*.ts" --include="*.tsx"
# Expected: matches in route.ts, DropZone.tsx, upload/page.tsx
```

### Final Checklist

- [ ] All "Must Have" present (7 references updated, timeouts hardened, ETA display, Docker limits)
- [ ] All "Must NOT Have" absent (no streaming, no chunked upload, no env var, no abort button, no `@ts-ignore`)
- [ ] Build, lint, and typecheck all pass
- [ ] Upload page displays "100MB" in UI
- [ ] ETA displays during file uploads after 10% progress
- [ ] XHR timeout fires at 10 minutes with user-friendly message
- [ ] Docker containers have memory limits configured
