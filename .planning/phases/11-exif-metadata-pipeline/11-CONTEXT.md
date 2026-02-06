# Phase 11: EXIF Metadata Pipeline - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract camera/shooting metadata from uploaded photos, store it in the database, display it to visitors in the lightbox, and provide a CLI backfill script for existing photos. GPS coordinates, camera serial numbers, and software/editor info are never stored or displayed.

</domain>

<decisions>
## Implementation Decisions

### Metadata display

- Expandable panel in the lightbox — hidden by default, revealed via an info icon tap/click
- Panel slides up or drops down over the photo when toggled

### Data selection

- Extended field set: camera body, lens, focal length, aperture, shutter speed, ISO, date taken, white balance, metering mode, flash status
- Camera body displayed as full EXIF string (e.g., "Canon EOS R5", "SONY ILCE-7RM4") — no parsing/cleanup
- Lens displayed as raw EXIF string (e.g., "EF70-200mm f/2.8L IS III USM") — photographers will recognize their gear
- Privacy exclusions: GPS coordinates, camera serial numbers, software/editor info (e.g., "Adobe Lightroom 6.0") — never stored

### Backfill experience

- CLI script only (e.g., `npm run exif:backfill`) — no admin panel button
- Summary output at the end — totals for processed, skipped, and failed photos
- Idempotent: only processes photos with no existing EXIF data — safe to re-run

### Claude's Discretion

- Info icon placement (toolbar vs floating on photo — based on current lightbox layout)
- EXIF panel format (icon row vs labeled list — based on existing design system)
- Panel behavior on photo navigation (stay open vs auto-close)
- Missing file handling during backfill (report vs skip silently)

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

_Phase: 11-exif-metadata-pipeline_
_Context gathered: 2026-02-05_
