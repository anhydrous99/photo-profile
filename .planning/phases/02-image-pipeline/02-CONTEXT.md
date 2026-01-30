# Phase 2: Image Pipeline - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Automatic processing of uploaded images through async job queue. Generates multiple thumbnail sizes (300px, 600px, 1200px, 2400px), converts to WebP format, and preserves originals. Handles processing for 50MP images within reasonable time. Upload interface and admin management are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User delegated all implementation decisions to Claude. Downstream agents should optimize for:

**Processing strategy:**

- Balance quality vs speed for large (50MP) images
- Choose appropriate Sharp settings (quality, compression, progressive encoding)
- Handle color profiles appropriately for photography
- Determine if/when to use streaming vs buffered processing

**Job queue behavior:**

- Design retry logic for transient failures
- Set appropriate concurrency limits to avoid resource exhaustion
- Determine queue priorities (if needed)
- Handle partial failures gracefully

**Output organization:**

- Design file naming convention for derivatives
- Structure directories for originals vs thumbnails vs format variants
- Track which derivatives exist for each photo

**Format strategy:**

- Choose WebP vs AVIF vs both based on browser support and quality
- Determine if JPEG fallbacks are needed
- Balance format variety vs storage cost

**Guiding principles from project:**

- "Let the photos speak for themselves" — prioritize visual quality
- Clean, distraction-free experience — fast loading is important
- Personal portfolio (not high-traffic) — optimize for quality over scale

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches that prioritize photography quality and reasonable performance.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 02-image-pipeline_
_Context gathered: 2026-01-29_
