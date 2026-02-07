---
phase: 13-album-management
plan: 02
subsystem: admin-ui
tags: [dnd-kit, react, drag-drop, album-detail, cover-photo]
dependency-graph:
  requires:
    - "13-01 (reorder API, findByAlbumId ordering, updatePhotoSortOrders)"
  provides:
    - "Admin album detail page at /admin/albums/[id]"
    - "SortablePhotoCard component for drag-drop photo grid"
    - "Cover photo selection via click-to-set UI"
    - "Navigation from albums list to album detail via Manage Photos button"
  affects: []
tech-stack:
  added: []
  patterns:
    - "rectSortingStrategy for dnd-kit grid layout (vs verticalListSortingStrategy for lists)"
    - "DragOverlay for clean visual feedback during grid drag"
key-files:
  created:
    - src/app/admin/(protected)/albums/[id]/page.tsx
    - src/app/admin/(protected)/albums/[id]/AlbumDetailClient.tsx
    - src/presentation/components/SortablePhotoCard.tsx
  modified:
    - src/presentation/components/index.ts
    - src/presentation/components/SortableAlbumCard.tsx
    - src/app/admin/(protected)/albums/AlbumsPageClient.tsx
decisions:
  - id: "13-02-a"
    decision: "Use rectSortingStrategy for photo grid (not verticalListSortingStrategy)"
    reason: "Photos display in a CSS grid, rectSortingStrategy calculates correct transforms for 2D layouts"
  - id: "13-02-b"
    decision: "DragOverlay with presentational clone for drag feedback"
    reason: "Grid layouts distort original elements during transform-based drag; overlay provides clean visuals"
  - id: "13-02-c"
    decision: "onManage prop is optional on SortableAlbumCard"
    reason: "Backward-compatible -- existing usages without onManage continue to work"
metrics:
  duration: "3 min"
  completed: "2026-02-06"
---

# Phase 13 Plan 02: Admin Album Detail Page Summary

Admin album detail page with drag-to-reorder photo grid using dnd-kit rectSortingStrategy, cover photo selection via click, and DragOverlay for smooth visual feedback.

## What Was Done

### Task 1: Create admin album detail page with drag-to-reorder and cover selection

**Commit:** `1db0217`

Created three new files and updated the components barrel:

1. **SortablePhotoCard** (`src/presentation/components/SortablePhotoCard.tsx`) -- Reusable sortable photo card using `useSortable` from dnd-kit. Features: cover badge (blue, top-left positioned), draggable photo area with `cursor-grab`, filename label, and "Set as cover" / "Current cover" text. Whole card is the drag handle via `{...attributes} {...listeners}`.

2. **AlbumDetailClient** (`src/app/admin/(protected)/albums/[id]/AlbumDetailClient.tsx`) -- Client component with full drag-drop grid and cover selection. Key features:
   - `DndContext` with `closestCenter` collision detection
   - `SortableContext` with `rectSortingStrategy` for grid layout
   - `DragOverlay` with presentational photo clone (opacity-80, shadow-xl)
   - `handleDragEnd`: optimistic `arrayMove` + POST to `/api/admin/albums/[id]/photos/reorder`, revert on error
   - `handleSetCover`: optimistic `album.coverPhotoId` update + PATCH to `/api/admin/albums/[id]`, revert on error
   - Responsive grid: 2 cols (mobile), 3 cols (sm), 4 cols (lg)
   - Header with "Back to Albums" link, album title, photo count
   - Empty state message when no photos
   - Saving indicator and auto-dismiss error messages

3. **Server component** (`src/app/admin/(protected)/albums/[id]/page.tsx`) -- Fetches album and photos in parallel using `SQLiteAlbumRepository.findById` and `SQLitePhotoRepository.findByAlbumId`. Filters to `status === "ready"` photos. Uses `Promise<{ id: string }>` params pattern for Next.js 16. Returns 404 if album not found.

4. **Components barrel** -- Added `SortablePhotoCard` export to `src/presentation/components/index.ts`.

### Task 2: Add navigation link from albums list to album detail pages

**Commit:** `6f4d754`

1. **SortableAlbumCard** -- Added optional `onManage` prop. Added "Manage Photos" button in the actions area, styled in indigo, placed before the Edit button. Button only renders when `onManage` is provided (backward-compatible).

2. **AlbumsPageClient** -- Added `handleManageClick` handler that calls `router.push(/admin/albums/${albumId})`. Passed `onManage={() => handleManageClick(album.id)}` to each `SortableAlbumCard`.

## Task Commits

| Task | Name                                   | Commit    | Key Files                                                        |
| ---- | -------------------------------------- | --------- | ---------------------------------------------------------------- |
| 1    | Admin album detail page (drag + cover) | `1db0217` | page.tsx, AlbumDetailClient.tsx, SortablePhotoCard.tsx, index.ts |
| 2    | Navigation link from albums list       | `6f4d754` | SortableAlbumCard.tsx, AlbumsPageClient.tsx                      |

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **rectSortingStrategy for photo grid** -- Photos display in a CSS grid layout, so `rectSortingStrategy` is used instead of `verticalListSortingStrategy` to correctly calculate 2D transforms.
2. **DragOverlay with presentational clone** -- Grid cells distort when CSS transforms are applied directly; `DragOverlay` renders a clean floating clone during drag.
3. **Optional onManage prop** -- Made the `onManage` prop optional on `SortableAlbumCard` so existing usages without it continue to work without changes.

## Verification Results

- `npm run typecheck` -- clean (no errors)
- `npm run lint` -- clean (0 errors, 2 pre-existing warnings in unrelated files)
- `npm run build` -- succeeds, new route `/admin/albums/[id]` appears in route list

## Next Phase Readiness

Phase 13 is now functionally complete. All album management features are implemented:

- Album CRUD (Phase 6, extended in 13-01)
- Photo reordering within albums (13-01 data layer + 13-02 UI)
- Cover photo selection (13-02)
- Navigation from albums list to album detail (13-02)

The checkpoint (Task 3) in the plan is for human verification of the drag-drop and cover selection UX.

## Self-Check: PASSED
