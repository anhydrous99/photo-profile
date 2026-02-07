# Phase 13: Album Management - Research

**Researched:** 2026-02-06
**Domain:** Admin album management -- cover photo selection, photo reordering within albums, FK constraint fix
**Confidence:** HIGH

## Summary

This phase adds two key admin features (cover photo selection and drag-to-reorder photos within an album) and fixes two known infrastructure bugs (coverPhotoId FK constraint and missing ORDER BY in findByAlbumId). Research focused on four areas: (1) the SQLite FK constraint migration approach, (2) dnd-kit grid-based sortable for photo reordering, (3) admin album detail page architecture, and (4) the cover photo selection UX pattern.

The project already uses `@dnd-kit/core@6.3.1` and `@dnd-kit/sortable@10.0.0` for album-level drag-drop reordering on the albums list page. This phase extends that same library for photo-level reordering within an album, using `rectSortingStrategy` (grid) instead of `verticalListSortingStrategy` (list). No new dependencies are required.

The critical infrastructure work is the SQLite FK constraint fix. SQLite does not support `ALTER TABLE ... ALTER CONSTRAINT`. The fix requires recreating the `albums` table with the correct `ON DELETE SET NULL` clause. Foreign keys are currently disabled in the database (`PRAGMA foreign_keys = 0`), which means the constraint is not enforced at all -- but fixing it now prevents future problems when FK enforcement is enabled.

**Primary recommendation:** Create an admin album detail page (`/admin/albums/[id]`) that shows a grid of photos with drag-to-reorder support and click-to-set-cover. Use the existing `@dnd-kit` setup with `rectSortingStrategy`. Fix the FK constraint via table recreation in `initializeDatabase()`. Add `updatePhotoSortOrders()` to the repository layer for persisting photo order.

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library            | Version | Purpose                | Why Standard                                          |
| ------------------ | ------- | ---------------------- | ----------------------------------------------------- |
| @dnd-kit/core      | 6.3.1   | Drag-drop primitives   | Already used for album reordering                     |
| @dnd-kit/sortable  | 10.0.0  | Sortable presets       | Already used; switch to rectSortingStrategy for grids |
| @dnd-kit/utilities | 3.2.2   | CSS transform helpers  | Already installed as transitive dep, already imported |
| drizzle-orm        | 0.45.1  | Database operations    | All existing CRUD uses Drizzle                        |
| zod                | 4.3.6   | Request validation     | Existing pattern in all API routes                    |
| Next.js            | 16.1.6  | App Router, API routes | Established patterns from prior phases                |

### No New Dependencies Required

This phase uses only existing libraries. The `@dnd-kit` packages already installed support grid-based sorting via `rectSortingStrategy`.

## Architecture Patterns

### New Admin Album Detail Page

The phase requires a new route: `/admin/albums/[id]` showing an album's photos in a sortable grid.

**Recommended structure:**

```
src/app/admin/(protected)/albums/[id]/
  page.tsx                    # Server Component: fetch album + photos
  AlbumDetailClient.tsx       # Client Component: drag-drop grid + cover selection
```

This follows the established pattern from the albums list page (`page.tsx` server component + `AlbumsPageClient.tsx` client component).

### Pattern 1: Server Component Data Fetching + Client Interactivity

**What:** Server component fetches data, client component handles drag-drop and cover selection.
**When to use:** All admin pages that need interactivity.
**Existing example:** `src/app/admin/(protected)/albums/page.tsx` + `AlbumsPageClient.tsx`

```typescript
// page.tsx (Server Component)
export default async function AlbumDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [album, photos] = await Promise.all([
    albumRepo.findById(id),
    photoRepo.findByAlbumId(id),  // After fix: returns photos ordered by sortOrder
  ]);
  if (!album) notFound();
  return <AlbumDetailClient album={album} photos={photos} />;
}
```

### Pattern 2: dnd-kit Grid Sortable (rectSortingStrategy)

**What:** Use `rectSortingStrategy` for grid-based photo reordering (vs `verticalListSortingStrategy` for lists).
**When to use:** When items are laid out in a CSS grid (photos in a grid).
**Source:** dnd-kit official docs

```typescript
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

// Grid layout with sortable photos
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
  <SortableContext
    items={photos.map(p => p.id)}
    strategy={rectSortingStrategy}
  >
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map(photo => (
        <SortablePhotoCard key={photo.id} photo={photo} isCover={album.coverPhotoId === photo.id} />
      ))}
    </div>
  </SortableContext>
  <DragOverlay>
    {activeId ? <PhotoCardOverlay photo={findPhoto(activeId)} /> : null}
  </DragOverlay>
</DndContext>
```

**Important:** The `items` prop MUST be sorted in the same order as the rendered items. This is critical for correct behavior.

### Pattern 3: Optimistic Update + API Persist

**What:** Update UI immediately on drag end, persist to API in background, revert on error.
**Existing example:** `AlbumsPageClient.tsx` lines 55-92 already implement this exact pattern for album reordering.

```typescript
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const oldIndex = photos.findIndex((p) => p.id === active.id);
  const newIndex = photos.findIndex((p) => p.id === over.id);

  // Optimistic update
  const newPhotos = arrayMove(photos, oldIndex, newIndex);
  setPhotos(newPhotos);

  try {
    await fetch(`/api/admin/albums/${albumId}/photos/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoIds: newPhotos.map((p) => p.id) }),
    });
  } catch {
    setPhotos(photos); // Revert on error
  }
};
```

### Pattern 4: Cover Photo Selection via Click

**What:** Clicking a photo in the admin album detail view sets it as the album cover. The current cover gets a visual indicator (border, badge, or overlay).
**Why click not drag:** Cover selection is a discrete action, not a spatial arrangement. A click is the simplest, most discoverable UX.

```typescript
const handleSetCover = async (photoId: string) => {
  // Optimistic update
  setAlbum((prev) => ({ ...prev, coverPhotoId: photoId }));

  await fetch(`/api/admin/albums/${albumId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coverPhotoId: photoId }),
  });
};
```

The API endpoint `PATCH /api/admin/albums/[id]` already supports `coverPhotoId` in the request body (verified in existing code).

### Pattern 5: SQLite Table Recreation Migration

**What:** Fix FK constraint by recreating the `albums` table with `ON DELETE SET NULL`.
**Why:** SQLite does not support `ALTER TABLE ... ALTER CONSTRAINT`. The standard approach is: disable FK checks, rename old table, create new table with correct constraints, copy data, drop old table, re-enable FK checks.
**Source:** SQLite official documentation (https://sqlite.org/foreignkeys.html)

```typescript
// In initializeDatabase(), after table creation:
// Migration: Fix coverPhotoId FK constraint (Phase 13)
const fkInfo = sqlite
  .prepare("PRAGMA foreign_key_list(albums)")
  .all() as Array<{
  table: string;
  from: string;
  on_delete: string;
}>;
const coverFk = fkInfo.find((fk) => fk.from === "cover_photo_id");
if (coverFk && coverFk.on_delete !== "SET NULL") {
  sqlite.pragma("foreign_keys = OFF");
  sqlite.exec(`
    BEGIN TRANSACTION;
    ALTER TABLE albums RENAME TO _albums_old;
    CREATE TABLE albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    INSERT INTO albums SELECT id, title, description, tags, cover_photo_id, sort_order, is_published, created_at FROM _albums_old;
    DROP TABLE _albums_old;
    COMMIT;
  `);
  sqlite.pragma("foreign_keys = ON");
  console.log("[DB] Fixed coverPhotoId FK constraint to ON DELETE SET NULL");
}
```

**Critical note:** The `tags` column was added after initial table creation (it exists in the current DB but not in the original CREATE TABLE). The recreated table MUST include `tags TEXT`.

### Anti-Patterns to Avoid

- **Using `db:push` for schema changes:** Drizzle's push on SQLite can cause runtime errors (learned in Phase 6). Use direct `ALTER TABLE` or table recreation in `initializeDatabase()`.
- **Building a separate cover photo selector UI:** The PATCH API already accepts `coverPhotoId`. Just click a photo in the existing grid -- no modal or separate component needed.
- **Using `verticalListSortingStrategy` for a photo grid:** This causes incorrect transform calculations for grid layouts. Must use `rectSortingStrategy`.
- **Storing photo order outside `photo_albums.sort_order`:** The junction table already has a `sort_order` column. Use it, don't add a new table or column.

## Don't Hand-Roll

| Problem                     | Don't Build                   | Use Instead                                 | Why                                                                     |
| --------------------------- | ----------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Drag-and-drop reordering    | Custom pointer event handling | @dnd-kit/sortable with rectSortingStrategy  | Touch support, accessibility (keyboard), animation, collision detection |
| Grid sort transforms        | CSS transform calculations    | CSS utility from @dnd-kit/utilities         | Cross-browser, handles grid cell positioning                            |
| Optimistic state management | Custom state diffing          | arrayMove from @dnd-kit/sortable + useState | Already proven pattern in AlbumsPageClient.tsx                          |
| FK constraint validation    | Application-level null checks | SQLite ON DELETE SET NULL                   | Database-level guarantee, no application code needed                    |

**Key insight:** The entire drag-drop infrastructure is already in the project. This phase is about applying the same dnd-kit patterns to a grid layout instead of a vertical list, plus adding a simple click-to-set-cover action.

## Common Pitfalls

### Pitfall 1: Incorrect sortOrder on Photo Add to Album

**What goes wrong:** When adding a photo to an album via `addToAlbum()`, sortOrder is hardcoded to 0 (see `SQLitePhotoRepository.ts` line 56). New photos get inserted at position 0, conflicting with existing photos.
**Why it happens:** The `addToAlbum` method was built before photo reordering was a requirement.
**How to avoid:** Either (a) set sortOrder to `MAX(sort_order) + 1` for the album when adding, or (b) accept 0 and let the reorder operation fix it. Option (a) is better for UX -- new photos appear at the end.
**Warning signs:** New photos appearing at the beginning of the album after add, or photos with duplicate sortOrder values.

### Pitfall 2: Photo Order Not Reflected on Public Page

**What goes wrong:** The public album page (`/albums/[id]`) fetches photos via `photoRepo.findByAlbumId(id)` but this method currently has NO ORDER BY clause.
**Why it happens:** Known bug documented in STATE.md.
**How to avoid:** Fix `findByAlbumId()` to `ORDER BY photo_albums.sort_order ASC`. This is one of the two infrastructure fixes explicitly scoped for Phase 13.
**Warning signs:** Public page shows photos in insertion order, not admin-arranged order.

### Pitfall 3: SQLite Column Order in Table Recreation

**What goes wrong:** When recreating the albums table, forgetting the `tags` column (added after initial creation) causes data loss.
**Why it happens:** The original CREATE TABLE in client.ts doesn't include `tags`, but the actual DB has it.
**How to avoid:** Use `PRAGMA table_info(albums)` to verify all columns, or explicitly include all known columns: `id, title, description, tags, cover_photo_id, sort_order, is_published, created_at`.
**Warning signs:** Tags disappearing from albums after migration.

### Pitfall 4: DragOverlay Missing for Grid Layouts

**What goes wrong:** Without a `DragOverlay`, the dragged item disappears or distorts during grid reordering because CSS transforms on the original element conflict with grid layout.
**Why it happens:** Grid cells have fixed positions; transform-based movement can look broken.
**How to avoid:** Use `DragOverlay` component with a presentational clone of the dragged photo card. Track `activeId` via `onDragStart`.
**Warning signs:** Dragged photo card flickering, wrong size, or invisible during drag.

### Pitfall 5: Foreign Keys Disabled in Current DB

**What goes wrong:** PRAGMA foreign_keys is currently 0 (disabled). Even after fixing the FK constraint definition, it won't be enforced unless explicitly enabled.
**Why it happens:** better-sqlite3 does not enable foreign keys by default. The project never explicitly enables them.
**How to avoid:** Add `sqlite.pragma("foreign_keys = ON")` in `initializeDatabase()` after all migrations. However, be cautious -- enabling FK enforcement on an existing database with potential violations could cause issues. Consider adding this as a separate deliberate step.
**Warning signs:** Deleting a photo that is a cover doesn't set coverPhotoId to null despite correct FK definition.

## Code Examples

### Photo Reorder API Endpoint

New API route needed: `POST /api/admin/albums/[id]/photos/reorder`

```typescript
// src/app/api/admin/albums/[id]/photos/reorder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { z } from "zod";

const reorderSchema = z.object({
  photoIds: z.array(z.string()),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: albumId } = await context.params;
  const body = await request.json();
  const result = reorderSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid data", details: result.error.flatten() },
      { status: 400 },
    );
  }

  // Update sort_order in photo_albums for this album
  await photoRepository.updatePhotoSortOrders(albumId, result.data.photoIds);

  return NextResponse.json({ success: true });
}
```

### Repository Method: updatePhotoSortOrders

New method for `PhotoRepository` interface and `SQLitePhotoRepository`:

```typescript
// Domain interface addition:
updatePhotoSortOrders(albumId: string, photoIds: string[]): Promise<void>;

// Infrastructure implementation:
async updatePhotoSortOrders(albumId: string, photoIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < photoIds.length; i++) {
      await tx
        .update(photoAlbums)
        .set({ sortOrder: i })
        .where(
          and(
            eq(photoAlbums.albumId, albumId),
            eq(photoAlbums.photoId, photoIds[i]),
          ),
        );
    }
  });
}
```

### Fix findByAlbumId to ORDER BY sortOrder

```typescript
async findByAlbumId(albumId: string): Promise<Photo[]> {
  const results = await db
    .select({ photo: photos })
    .from(photos)
    .innerJoin(photoAlbums, eq(photos.id, photoAlbums.photoId))
    .where(eq(photoAlbums.albumId, albumId))
    .orderBy(photoAlbums.sortOrder);  // ADD THIS LINE
  return results.map((r) => this.toDomain(r.photo));
}
```

### SortablePhotoCard Component

```typescript
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortablePhotoCardProps {
  photo: { id: string; title: string | null; originalFilename: string; blurDataUrl: string | null };
  isCover: boolean;
  onSetCover: (photoId: string) => void;
}

export function SortablePhotoCard({ photo, isCover, onSetCover }: SortablePhotoCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Cover indicator */}
      {isCover && (
        <div className="absolute top-2 left-2 z-10 rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
          Cover
        </div>
      )}

      {/* Drag handle area */}
      <div {...attributes} {...listeners} className="cursor-grab">
        {/* Photo thumbnail */}
        <div className="aspect-square overflow-hidden rounded-lg border border-gray-200">
          <img
            src={`/api/images/${photo.id}`}
            alt={photo.title || photo.originalFilename}
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      {/* Set as cover button */}
      {!isCover && (
        <button
          type="button"
          onClick={() => onSetCover(photo.id)}
          className="mt-1 text-xs text-gray-500 hover:text-blue-600"
        >
          Set as cover
        </button>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach                | Current Approach                    | When Changed       | Impact                                                    |
| --------------------------- | ----------------------------------- | ------------------ | --------------------------------------------------------- |
| db:push for migrations      | ALTER TABLE in initializeDatabase() | Phase 6 (bug fix)  | All schema changes use migration pattern                  |
| No photo ordering in albums | photo_albums.sort_order column      | Phase 1 (designed) | Column exists but never populated or queried              |
| No cover photo              | albums.cover_photo_id column        | Phase 1 (designed) | Column exists, API supports it, but no admin UI to set it |

**Already prepared infrastructure:**

- `photo_albums.sort_order` column exists since Phase 1
- `albums.cover_photo_id` column exists since Phase 1
- `PATCH /api/admin/albums/[id]` already accepts `coverPhotoId`
- `@dnd-kit` already installed and proven in the project
- `FadeImage` component available for photo thumbnails in the grid

## Open Questions

1. **Should we enable PRAGMA foreign_keys = ON?**
   - What we know: Currently 0 (disabled). The FK constraint fix is meaningless without enforcement.
   - What's unclear: Whether enabling FK enforcement would break existing data (e.g., orphaned references).
   - Recommendation: Add `sqlite.pragma("foreign_keys = ON")` in client.ts, but run a data integrity check first. This could be a pre-migration validation step.

2. **Cover photo click vs. right-click/context menu?**
   - What we know: Requirements say "Admin can select a cover photo." Click is simplest.
   - What's unclear: Whether a "Set as cover" button per photo is discoverable enough, or if a right-click context menu is expected.
   - Recommendation: Use a visible "Set as cover" button on each photo card in the grid. The current cover photo gets a badge overlay ("Cover"). This is the most straightforward, discoverable approach.

3. **DragOverlay vs. inline drag?**
   - What we know: Grid layouts benefit from DragOverlay for cleaner drag visuals.
   - What's unclear: Whether the photo grid is complex enough to warrant DragOverlay overhead.
   - Recommendation: Use DragOverlay. The album list page doesn't use it (vertical list is simpler), but for a grid of photo thumbnails, the visual improvement is worth the ~15 lines of extra code.

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `src/infrastructure/database/schema.ts`, `SQLitePhotoRepository.ts`, `SQLiteAlbumRepository.ts`, `client.ts`
- Codebase inspection: `src/app/admin/(protected)/albums/` (existing album management pages)
- Codebase inspection: `src/app/api/admin/albums/[id]/route.ts` (existing PATCH endpoint)
- SQLite PRAGMA output: `PRAGMA foreign_key_list(albums)` confirms `on_delete = NO ACTION`
- SQLite PRAGMA output: `PRAGMA foreign_keys` confirms value is `0` (disabled)
- Actual DB schema: `CREATE TABLE albums` lacks `ON DELETE SET NULL`
- dnd-kit official docs: https://docs.dndkit.com/presets/sortable/sortable-context (sorting strategies)

### Secondary (MEDIUM confidence)

- SQLite official docs: https://sqlite.org/foreignkeys.html (table recreation migration approach)
- dnd-kit sortable docs: https://docs.dndkit.com/presets/sortable (grid layout with rectSortingStrategy)

### Tertiary (LOW confidence)

- None. All findings verified against codebase or official documentation.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries already installed and in use; no new deps needed
- Architecture: HIGH - Follows exact patterns established in Phase 6 (album CRUD) and Phase 11-12 (migrations)
- Pitfalls: HIGH - FK constraint bug verified via PRAGMA; sortOrder bug verified via code inspection
- Code examples: HIGH - Based on existing codebase patterns with verified API capabilities

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable -- all deps already locked in package.json)
