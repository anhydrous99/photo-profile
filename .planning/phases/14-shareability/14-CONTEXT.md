# Phase 14: Shareability - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Direct photo links and OpenGraph meta tags for social sharing. Visitors can link directly to a specific photo and shared links look good when previewed on social media. Covers: URL routing for individual photos, deep link landing behavior, and OG meta tags for photos, albums, and homepage.

</domain>

<decisions>
## Implementation Decisions

### URL strategy

- Photo URLs use **path segments**: `/photo/{slug}` for homepage photos, `/albums/{albumId}/photo/{slug}` for album photos
- Photo slug is the **first 8 characters of the UUID** (e.g., `/photo/a1b2c3d4`) for clean, short URLs
- Lightbox navigation updates the URL as the user browses photos
- History management: **Claude's discretion** (replaceState vs pushState — pick what avoids excessive history entries per success criteria)

### Deep link behavior

- Landing view when navigating to a photo URL: **Claude's discretion** (lightbox over gallery vs dedicated page — pick what works best with the architecture)
- Album photo deep links: **Claude's discretion** on whether lightbox allows full album navigation or single photo only
- Missing/deleted photo URLs: **Claude's discretion** (404 vs redirect)
- Context cues (breadcrumb, album name): **Claude's discretion** based on the site's existing design language

### OpenGraph cards

- Photo OG card content: **Claude's discretion** on whether to include EXIF data in description (e.g., "Shot on Canon R5 - 85mm - f/1.4")
- Homepage OG: **Claude's discretion** on whether site name/description come from env vars or defaults
- OG image sizing: **Claude's discretion** on whether to generate a 1200x630 OG-specific derivative or reuse existing width derivatives
- Twitter/X card format: **Claude's discretion** (summary_large_image vs summary)

### Share affordances

- Not discussed — no copy-link button or share icon in lightbox for this phase. Users share via browser URL bar.

### Claude's Discretion

Claude has wide latitude on this phase. The user locked two key decisions:

1. **Path segment URLs** (not hash or query param)
2. **Short slug** (first 8 chars of UUID, not full UUID)

Everything else — landing view, navigation behavior, OG content, image sizing, history management, error handling — is Claude's discretion. Make choices that align with the portfolio's clean, photo-first design language.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The user wants clean, short URLs and trusts Claude's judgment on the UX and OG implementation details.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 14-shareability_
_Context gathered: 2026-02-06_
