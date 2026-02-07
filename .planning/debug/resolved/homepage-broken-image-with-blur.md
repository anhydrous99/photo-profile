---
status: resolved
trigger: "homepage-broken-image-with-blur"
created: 2026-02-05T00:00:00Z
updated: 2026-02-05T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED
test: All srcSet URLs (300w, 600w, 1200w, 2400w) now return 200
expecting: N/A - verified
next_action: Archive session

## Symptoms

expected: Blur placeholder visible briefly, then smooth ~300ms fade-in to the full image
actual: The blur placeholder background appears, but there's a broken image symbol/icon in the upper left corner. The actual image never loads.
errors: Broken image icon visible (browser's default broken image indicator)
reproduction: Visit the homepage (/)
started: Likely introduced by Phase 10 changes (FadeImage component, custom image loader, next.config.ts update)

## Eliminated

- hypothesis: Loader URL pattern doesn't match API route pattern
  evidence: URL pattern is correct - /api/images/{photoId}/{width}w.webp matches [photoId]/[filename] route
  timestamp: 2026-02-05T00:00:30Z

- hypothesis: API route is broken
  evidence: curl /api/images/{id}/300w.webp returns 200 with correct image/webp content
  timestamp: 2026-02-05T00:00:30Z

- hypothesis: FadeImage src prop constructed incorrectly
  evidence: HTML output shows correct src=/api/images/{photoId} passed through loader correctly
  timestamp: 2026-02-05T00:00:30Z

- hypothesis: preload prop is invalid
  evidence: Next.js 16 supports preload prop (replaced deprecated priority)
  timestamp: 2026-02-05T00:00:30Z

## Evidence

- timestamp: 2026-02-05T00:00:20Z
  checked: Processed image files on disk for photo 71488576-5a2a-41b6-a607-aabae71bb014
  found: Only 300w.avif, 300w.webp, 600w.avif, 600w.webp exist (no 1200w or 2400w)
  implication: Original image was smaller than 1200px so generateDerivatives skipped larger sizes

- timestamp: 2026-02-05T00:00:25Z
  checked: Homepage HTML img srcSet attribute
  found: srcSet includes 1200w.webp and 2400w.webp URLs that don't exist on disk
  implication: Browser selects a large srcset entry for hero image but gets 404

- timestamp: 2026-02-05T00:00:30Z
  checked: curl 1200w.webp -> 404, 2400w.webp -> 404, 300w.webp -> 200, 600w.webp -> 200
  found: API correctly returns 404 for non-existent files, 200 for existing ones
  implication: Confirms the mismatch between loader-generated URLs and available derivatives

- timestamp: 2026-02-05T00:00:35Z
  checked: imageService.ts generateDerivatives function
  found: Line 63: `if (originalWidth < width) continue` - intentionally skips upscaling
  implication: This is correct behavior; the loader just needs to handle this case

- timestamp: 2026-02-05T00:01:30Z
  checked: All derivative URLs after fix applied
  found: 300w.webp=200(17998b), 600w.webp=200(49334b), 1200w.webp=200(49334b fallback), 2400w.webp=200(49334b fallback)
  implication: Fix works - non-existent sizes fall back to largest available derivative

- timestamp: 2026-02-05T00:01:35Z
  checked: Edge cases - AVIF fallback, nonexistent photo ID, directory traversal
  found: AVIF fallback=200, nonexistent ID=404, traversal=404
  implication: Security preserved, all formats handled

- timestamp: 2026-02-05T00:01:40Z
  checked: TypeScript typecheck and ESLint
  found: 0 type errors, 0 new lint errors (only pre-existing warnings)
  implication: Fix is clean code

## Resolution

root_cause: The custom image loader (imageLoader.ts) always generates URLs for all AVAILABLE_WIDTHS [300, 600, 1200, 2400], but generateDerivatives() correctly skips sizes larger than the original image (no upscaling). When the browser selects a large srcset entry (e.g. 1200w.webp for the hero image), the API route returned 404 because that derivative file was never created on disk. The browser then displayed its broken image icon.
fix: Modified the image API route to fall back to the largest available derivative of the same format when the exact requested file doesn't exist. Added findLargestDerivative() helper that reads the photo's processed directory, filters by format extension, and returns the file with the highest width. Extracted serveImage() helper to avoid code duplication.
verification: All 4 derivative sizes (300w, 600w, 1200w, 2400w) now return HTTP 200 for both .webp and .avif. Non-existent photo IDs still return 404. Directory traversal attempts still blocked. TypeScript and ESLint pass clean.
files_changed: [src/app/api/images/[photoId]/[filename]/route.ts]
