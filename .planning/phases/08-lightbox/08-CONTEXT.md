# Phase 8: Lightbox - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Immersive full-size photo viewing with navigation. Visitors click a photo from the gallery to open it in a lightbox overlay, navigate between photos using keyboard/gestures, and close to return to the gallery. Photo descriptions are displayed when available. This is the core engagement point where visitors experience the photography work.

</domain>

<decisions>
## Implementation Decisions

### Visual Presentation

- Photo scaling: Contain strategy (fit entirely within viewport, preserve aspect ratio)
- Background: Solid black (no transparency, no blur)
- Viewport padding: Leave breathing room (5-10% padding, photo doesn't touch edges)
- UI control visibility: Minimal approach
  - Close button always visible in top-right
  - Navigation arrows appear only on hover
  - Keyboard-first UX philosophy

### Navigation Controls

- Keyboard shortcuts:
  - Left/Right arrow keys for prev/next navigation
  - Escape key closes lightbox
- Desktop navigation: Subtle chevron icons on left/right edges (hover-triggered)
- Mobile navigation: Swipe gestures (left/right to navigate between photos)
- Close behavior: X button in top-right corner only (no click-outside, no swipe-down)

### Claude's Discretion

- Exact icon styling and sizing for navigation arrows
- Specific padding percentages (within 5-10% range)
- Loading state handling while next photo loads
- Photo description display positioning and styling
- Opening/closing animation timing and easing
- Touch gesture sensitivity thresholds

</decisions>

<specifics>
## Specific Ideas

None — user trusts standard lightbox patterns with the visual/navigation preferences above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 08-lightbox_
_Context gathered: 2026-01-31_
