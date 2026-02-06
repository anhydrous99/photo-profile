# Phase 10: Polish - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Final optimizations for production-quality experience: blur placeholders while images load, performance optimization for fast page loads, and Docker deployment configuration. No new features — this phase polishes what's already built.

</domain>

<decisions>
## Implementation Decisions

### Blur placeholder style

- Smooth fade-in transition (~300ms) from placeholder to loaded image
- Claude's discretion on technique (blurhash vs CSS blur on tiny image vs other)
- Claude's discretion on color approach (derived from photo colors vs neutral)
- Claude's discretion on where placeholders appear (grids, hero, lightbox — wherever it matters most)

### Image loading behavior

- Claude's discretion on aspect ratio handling (fixed vs preserved) based on current grid implementation
- Claude's discretion on lazy loading strategy per page type
- Claude's discretion on Next.js Image vs native `<img>` based on codebase fit
- Claude's discretion on AVIF vs WebP format priority

### Performance targets

- Target: 0.5 second initial page load, 1 second acceptable
- Aggressive HTTP caching: long cache times for images, long for pages where appropriate
- No specific pain points reported — this is proactive optimization
- Claude's discretion on photo count upper bound per page

### Claude's Discretion

- Blur placeholder implementation technique (blurhash, tiny image, etc.)
- Placeholder color strategy (photo-derived vs neutral)
- Where placeholders appear
- Aspect ratio handling approach
- Lazy loading strategy
- Image component choice (Next.js Image vs native)
- Image format serving priority (AVIF vs WebP)
- Performance optimization techniques
- Photo count limits per page

</decisions>

<specifics>
## Specific Ideas

- User wants aggressive performance: 0.5s target for first meaningful content, 1s acceptable
- Smooth fade-in transition is the one firm visual requirement — no instant swaps
- Aggressive caching desired — prioritize speed over content freshness
- Site currently feels fine — no known bottlenecks, this is about raising the bar

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 10-polish_
_Context gathered: 2026-02-05_
