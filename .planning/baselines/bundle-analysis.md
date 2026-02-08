# Bundle Analysis Baseline

**Date:** 2026-02-08
**Build tool:** Next.js 16.1.6 (webpack mode)
**Command:** `ANALYZE=true next build --webpack`

## Summary

| Metric                     | Raw           | Gzipped     |
| -------------------------- | ------------- | ----------- |
| Total shared chunks (JS)   | 1,006.9KB     | 311.8KB     |
| Total app page chunks      | 62.7KB        | 28.2KB      |
| Total CSS                  | 43.1KB        | 9.4KB       |
| **Grand total (JS + CSS)** | **1,112.7KB** | **349.4KB** |

## Largest Shared Chunks

| Chunk                         | Raw     | Gzipped | Contents                                      |
| ----------------------------- | ------- | ------- | --------------------------------------------- |
| 4bd1b696-096d35a2bd1da3af.js  | 193.8KB | 61.0KB  | react-dom (client runtime)                    |
| framework-75892d61b920805f.js | 185.2KB | 58.5KB  | React framework internals                     |
| 794-37dad9bbc14b04b8.js       | 183.7KB | 50.0KB  | Next.js App Router (navigation, LayoutRouter) |
| main-3467e0ab5b083a89.js      | 130.7KB | 37.7KB  | Next.js main client entry                     |
| polyfills-42372ed130431b0a.js | 110.0KB | 38.6KB  | Browser polyfills                             |
| 934-80e7d7ac0200e135.js       | 106.9KB | 31.7KB  | @dnd-kit/sortable (drag-and-drop)             |
| 280.102acb1ebccad9e3.js       | 44.9KB  | 16.1KB  | yet-another-react-lightbox                    |
| 820-dc4919f850536b14.js       | 22.5KB  | 5.9KB   | Shared utilities                              |
| 437-e9ac25f85fcf9ad9.js       | 12.3KB  | 4.9KB   | Shared utilities                              |
| 500-5d45efbf86b8d36e.js       | 8.5KB   | 3.4KB   | Shared utilities                              |
| webpack-8be6918170551717.js   | 4.5KB   | 2.2KB   | Webpack runtime                               |
| 948.9dc7f08cd66584c8.js       | 3.3KB   | 1.7KB   | Small shared chunk                            |
| main-app-f3760df75e89a5f5.js  | 0.5KB   | 0.2KB   | App Router bootstrap                          |

## CSS Files

| File                 | Raw    | Gzipped |
| -------------------- | ------ | ------- |
| 9b3d778b72ee13e5.css | 36.6KB | 7.7KB   |
| f007678ac689f984.css | 6.5KB  | 1.7KB   |

## Observations

1. **Framework overhead is dominant:** react-dom (193.8KB), framework (185.2KB), and Next.js router (183.7KB) together account for 562.7KB raw / 169.5KB gzipped -- 56% of all shared JS. This is non-reducible framework cost.

2. **Admin-only dependencies in shared chunks:** @dnd-kit/sortable (106.9KB raw) is used only in admin pages for drag-and-drop reordering. This library is loaded as a shared chunk, meaning it may be fetched on public pages that do not need it. Dynamic imports could reduce the public page first-load.

3. **Lightbox in shared chunk:** yet-another-react-lightbox (44.9KB raw) is only used on gallery/photo pages. It could potentially be dynamically imported to avoid loading on the albums listing and admin pages.

4. **CSS is well-compressed:** 43.1KB raw compresses to 9.4KB gzipped (78% compression), indicating good utility-class patterns from Tailwind.

5. **Page-specific chunks are small:** All page-specific JS totals only 62.7KB raw, showing that route-level code splitting is working well via Next.js App Router.

## Interactive Reports

Bundle analyzer HTML reports are saved to:

- `.next/analyze/client.html` -- Client-side bundle treemap
- `.next/analyze/nodejs.html` -- Server-side bundle treemap
- `.next/analyze/edge.html` -- Edge runtime bundle treemap

Open these in a browser for interactive exploration.

## Optimization Targets

Based on this analysis, the primary optimization opportunities are:

1. **Dynamic import @dnd-kit/sortable** -- 106.9KB raw only needed in admin drag-and-drop pages
2. **Dynamic import lightbox** -- 44.9KB raw only needed when viewing individual photos
3. **Polyfills review** -- 110KB of polyfills; modern-only browsers may not need all of them (controlled by Next.js browserslist config)
