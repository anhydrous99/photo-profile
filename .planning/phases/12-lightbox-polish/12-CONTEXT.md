# Phase 12: Lightbox Polish - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the lightbox feel native and responsive across devices. Four capabilities: responsive image derivative selection, swipe-down-to-close on mobile, pinch/double-tap zoom on mobile, and a fullscreen toggle button. The existing YARL lightbox is the foundation — this phase enhances it, not replaces it.

</domain>

<decisions>
## Implementation Decisions

### Responsive image loading

- Claude's discretion on load strategy (direct load vs progressive upgrade from blur/thumbnail) — pick what fits YARL's patterns best
- Claude's discretion on device pixel ratio handling — decide whether to account for retina (e.g., 1440px \* 2x = 2400w) or match CSS width only
- Claude's discretion on resize behavior — decide whether to re-select derivatives on viewport resize or keep what was picked at open time
- Claude's discretion on format preference — decide whether to prefer AVIF over WebP when browser supports it, or stick with WebP for simplicity

### Touch gesture feel

- Claude's discretion on swipe-down-to-close feel — choose between drag-to-dismiss (photo follows finger with opacity fade, like iOS) or gesture-detect-then-animate
- Claude should investigate whether YARL already provides swipe left/right navigation — if not, ensure it works and doesn't conflict with zoom panning
- Claude's discretion on double-tap zoom level — choose between fixed 2x or zoom-to-natural-resolution based on what feels right for a photography portfolio
- Claude's discretion on EXIF panel behavior during zoom — decide whether to hide or keep visible when user is zoomed in

### Fullscreen experience

- Fullscreen button in YARL toolbar, gracefully absent on unsupported browsers (e.g., iPhone Safari)
- Claude's discretion on toolbar auto-hide, exit method, and keyboard shortcuts

### Claude's Discretion

All implementation decisions for this phase are at Claude's discretion. The user trusts Claude to make choices that result in a polished, native-feeling lightbox experience appropriate for a photography portfolio. Research YARL's capabilities and built-in gesture/zoom support before implementing custom solutions.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The user wants the lightbox to feel native and responsive, trusting Claude to make the right calls based on YARL's capabilities and what works well for photography viewing.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 12-lightbox-polish_
_Context gathered: 2026-02-06_
