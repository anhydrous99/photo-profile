# Phase 4: Photo Upload - Context

**Gathered:** 2026-01-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can upload photos through an intuitive drag-drop interface with batch processing and progress tracking. This phase delivers the upload UI, file handling, and triggers the image processing pipeline (Phase 2). Photo management (descriptions, albums, deletion) comes in Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Upload interface design

- **Large centered zone** — Prominent drop target filling most of viewport with clear call-to-action
- **Minimal visual states** — Simple border change when dragging over (idle/active only)
- No complex animations or rich feedback states

### Claude's Discretion

- File preview style (thumbnail grid, list, or carousel) after files are dropped
- Whether to include click-to-browse fallback alongside drag-drop
- Exact drop zone styling and typography
- Success confirmation method (toast, persistent state, or auto-redirect)
- Progress information granularity (per-file detailed, overall batch, or hybrid)
- Upload failure handling (retry option, continue others, or halt all)
- Image processing status visibility (show processing workflow or hide in background)

</decisions>

<specifics>
## Specific Ideas

- Drag-drop should be the primary interaction — large, obvious, centered
- Keep visual feedback simple and clean, matching the "photos speak for themselves" philosophy
- Phase 2 image pipeline (BullMQ + Sharp) already exists and will be triggered after upload

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 04-photo-upload_
_Context gathered: 2026-01-30_
