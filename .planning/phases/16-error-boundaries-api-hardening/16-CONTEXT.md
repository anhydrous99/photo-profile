# Phase 16: Error Boundaries & API Hardening - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure every failure surface has a designed recovery path. Error boundaries catch unhandled React errors and show styled pages. 404 and loading states replace blank flashes. API routes validate input with Zod and return consistent error shapes. Upload safeguards reject oversized files before reading into memory, and queue/processing failures are logged and surfaced.

</domain>

<decisions>
## Implementation Decisions

### Upload failure handling

- Oversized file rejection: show a toast notification with the rejection reason (e.g., "File exceeds 25MB limit"), upload area resets
- Multi-file uploads with partial failures: upload the valid files, show a summary of what failed and why (don't reject the entire batch)

### Claude's Discretion

- Error page design: visual style, tone, retry button placement, navigation options for error.tsx, global-error.tsx, not-found.tsx
- Loading state approach: skeletons vs spinners vs shimmer for loading.tsx route segments
- API error response shape: status code conventions, detail level, Zod validation message formatting
- Job failure notification: how admin discovers failed processing jobs (error badge, toast, or other pattern — fit existing admin UI)
- Queue unavailability during upload: whether to reject the upload or save the file and warn (fit existing graceful degradation patterns)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 16-error-boundaries-api-hardening_
_Context gathered: 2026-02-07_
