# Phase 6: Album Management - Research

**Researched:** 2026-01-31
**Domain:** Admin CRUD for albums (create, rename, delete) with drag-drop ordering and category tags
**Confidence:** HIGH

## Summary

This phase implements album management for the admin: creating, renaming, and deleting albums, with drag-drop reordering and optional category tags. Research focused on four areas: (1) CRUD operations using existing AlbumRepository patterns, (2) drag-drop ordering with dnd-kit, (3) deletion with two modes (album-only vs cascade), and (4) free-form tags storage strategy.

The project has an established album schema from Phase 1/2 with `sortOrder`, `coverPhotoId`, and `isPublished` fields. The existing `photoAlbums` junction table supports cascade delete on both foreign keys. The SQLiteAlbumRepository already provides basic CRUD methods (`findById`, `findAll`, `save`, `delete`).

**Primary recommendation:** Use @dnd-kit/sortable for drag-drop ordering, with optimistic UI updates and a single API call to persist the new order. Implement deletion as a modal with explicit choice between "delete album only" or "delete album and photos." Store category tags as a comma-separated TEXT field for simplicity (not JSON) since querying by tag is not required.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)

| Library     | Version | Purpose                 | Why Standard                                           |
| ----------- | ------- | ----------------------- | ------------------------------------------------------ |
| Next.js     | 16.1.6  | Server Actions, routing | Already in use; established CRUD patterns from Phase 5 |
| drizzle-orm | 0.45.1  | Database operations     | Already configured with albums and photoAlbums tables  |
| React       | 19.2.3  | UI, hooks               | `useOptimistic`, `useState` for form and reorder state |
| Zod         | 4.3.6   | Validation              | Already used in auth and photo actions                 |
| Tailwind    | 4.x     | Styling                 | Existing styling patterns for modals, forms, buttons   |

### New Dependencies Required

| Library           | Version | Purpose               | When to Use                         |
| ----------------- | ------- | --------------------- | ----------------------------------- |
| @dnd-kit/core     | ^6.3.1  | Drag-drop primitives  | Required for any drag-drop UI       |
| @dnd-kit/sortable | ^10.0.0 | Sortable list presets | Vertical list reordering for albums |

### Alternatives Considered

| Instead of          | Could Use            | Tradeoff                                                         |
| ------------------- | -------------------- | ---------------------------------------------------------------- |
| @dnd-kit            | react-movable (~3kB) | Smaller bundle but less extensible; dnd-kit is industry standard |
| @dnd-kit            | @hello-pangea/dnd    | Simpler API but less active development                          |
| Separate tags table | JSON array column    | JSON requires indexing workarounds; simple text suffices         |

**Installation:**

```bash
npm install @dnd-kit/core @dnd-kit/sortable
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── admin/(protected)/
│   │   ├── albums/
│   │   │   ├── page.tsx              # Album list with drag-drop ordering
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Album edit page (rename, cover, delete)
│   │   └── page.tsx                  # Existing dashboard (shows album count)
│   └── api/
│       └── admin/
│           └── albums/
│               ├── route.ts          # GET all, POST create
│               ├── [id]/
│               │   └── route.ts      # GET, PATCH, DELETE single album
│               └── reorder/
│                   └── route.ts      # POST reorder (batch update sortOrder)
├── presentation/
│   └── components/
│       ├── AlbumList.tsx             # Sortable album list component
│       ├── AlbumCard.tsx             # Draggable album card
│       ├── AlbumCreateForm.tsx       # Create new album (inline or modal)
│       ├── AlbumEditForm.tsx         # Edit name, description, tags
│       ├── DeleteAlbumModal.tsx      # Confirmation with mode selection
│       └── CoverPhotoSelector.tsx    # Pick cover from album photos
└── infrastructure/
    └── database/
        └── repositories/
            └── SQLiteAlbumRepository.ts  # Extend with getPhotoCount, reorder
```

### Pattern 1: Drag-Drop Reorder with dnd-kit

**What:** Admin drags albums to reorder; order persists to database.
**When to use:** Album list page for manual ordering.

**Example:**

```typescript
// src/presentation/components/AlbumList.tsx
'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Album } from '@/domain/entities';

interface AlbumListProps {
  albums: Album[];
  onReorder: (albumIds: string[]) => Promise<void>;
}

export function AlbumList({ albums: initialAlbums, onReorder }: AlbumListProps) {
  const [albums, setAlbums] = useState(initialAlbums);
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = albums.findIndex((a) => a.id === active.id);
      const newIndex = albums.findIndex((a) => a.id === over.id);

      // Optimistic update
      const newOrder = arrayMove(albums, oldIndex, newIndex);
      setAlbums(newOrder);

      // Persist to server
      setIsSaving(true);
      try {
        await onReorder(newOrder.map((a) => a.id));
      } catch {
        // Revert on error
        setAlbums(initialAlbums);
      } finally {
        setIsSaving(false);
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={albums.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        {albums.map((album) => (
          <SortableAlbumCard key={album.id} album={album} />
        ))}
      </SortableContext>
      {isSaving && <span className="text-sm text-gray-500">Saving...</span>}
    </DndContext>
  );
}
```

**Sortable Item:**

```typescript
// src/presentation/components/SortableAlbumCard.tsx
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Album } from '@/domain/entities';

interface Props {
  album: Album;
}

export function SortableAlbumCard({ album }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: album.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 rounded-lg border bg-white p-4"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab p-1 text-gray-400 hover:text-gray-600"
        aria-label="Drag to reorder"
      >
        <GripVerticalIcon className="h-5 w-5" />
      </button>

      {/* Album info */}
      <div className="flex-1">
        <h3 className="font-medium">{album.title}</h3>
        {album.description && (
          <p className="text-sm text-gray-500">{album.description}</p>
        )}
      </div>
    </div>
  );
}
```

### Pattern 2: Album CRUD API Routes

**What:** REST-style API routes for album management.
**When to use:** All album operations.

**Create Album:**

```typescript
// src/app/api/admin/albums/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories";
import { z } from "zod";

const createAlbumSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  tags: z.string().max(200).optional(), // comma-separated
});

const albumRepository = new SQLiteAlbumRepository();

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = createAlbumSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid data", details: result.error.flatten() },
      { status: 400 },
    );
  }

  // Get max sortOrder to append at end
  const albums = await albumRepository.findAll();
  const maxSortOrder = Math.max(0, ...albums.map((a) => a.sortOrder));

  const album = {
    id: crypto.randomUUID(),
    title: result.data.title,
    description: result.data.description ?? null,
    tags: result.data.tags ?? null,
    coverPhotoId: null,
    sortOrder: maxSortOrder + 1,
    isPublished: false,
    createdAt: new Date(),
  };

  await albumRepository.save(album);

  return NextResponse.json(album, { status: 201 });
}

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const albums = await albumRepository.findAll();
  // Sort by sortOrder
  albums.sort((a, b) => a.sortOrder - b.sortOrder);

  return NextResponse.json(albums);
}
```

**Reorder Albums:**

```typescript
// src/app/api/admin/albums/reorder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories";
import { z } from "zod";

const reorderSchema = z.object({
  albumIds: z.array(z.string()),
});

const albumRepository = new SQLiteAlbumRepository();

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = reorderSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  // Update sortOrder for each album
  await albumRepository.updateSortOrders(result.data.albumIds);

  return NextResponse.json({ success: true });
}
```

### Pattern 3: Deletion with Mode Selection

**What:** Modal presents choice: delete album only OR delete album + all photos.
**When to use:** Album deletion.

**Example Modal:**

```typescript
// src/presentation/components/DeleteAlbumModal.tsx
'use client';

import { useState } from 'react';

interface Props {
  albumTitle: string;
  photoCount: number;
  onConfirm: (deletePhotos: boolean) => Promise<void>;
  onCancel: () => void;
}

export function DeleteAlbumModal({ albumTitle, photoCount, onConfirm, onCancel }: Props) {
  const [deletePhotos, setDeletePhotos] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    await onConfirm(deletePhotos);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">
          Delete "{albumTitle}"?
        </h2>

        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="deleteMode"
              checked={!deletePhotos}
              onChange={() => setDeletePhotos(false)}
              className="mt-0.5"
            />
            <div>
              <p className="font-medium">Delete album only</p>
              <p className="text-sm text-gray-500">
                Photos will remain in your library, just unassigned from this album.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="deleteMode"
              checked={deletePhotos}
              onChange={() => setDeletePhotos(true)}
              className="mt-0.5"
            />
            <div>
              <p className="font-medium text-red-600">Delete album and all photos</p>
              <p className="text-sm text-gray-500">
                Permanently delete the album and {photoCount} photo{photoCount !== 1 ? 's' : ''}.
                This cannot be undone.
              </p>
            </div>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded px-4 py-2 text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className={`rounded px-4 py-2 text-white ${
              deletePhotos
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-800 hover:bg-gray-900'
            }`}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Pattern 4: Tags as Comma-Separated Text

**What:** Store tags as simple comma-separated text, not JSON.
**When to use:** Free-form category tags without query requirements.

**Schema Addition:**

```typescript
// Add to src/infrastructure/database/schema.ts
export const albums = sqliteTable("albums", {
  // ... existing fields ...
  tags: text("tags"), // comma-separated, e.g. "landscape,nature,2024"
});
```

**Parsing Utility:**

```typescript
// src/presentation/lib/tags.ts
export function parseTags(tagString: string | null): string[] {
  if (!tagString) return [];
  return tagString
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function formatTags(tags: string[]): string {
  return tags.map((t) => t.trim()).join(", ");
}
```

### Anti-Patterns to Avoid

- **Saving on every keystroke in name field:** Use blur-based auto-save or explicit save button for text fields.
- **JSON arrays for tags without indexing needs:** Simple comma-separated text is sufficient when you don't need to query by tag.
- **Cascading photo deletion without confirmation:** Always require explicit user choice for destructive operations.
- **Saving reorder on every drag move:** Only persist order on `dragEnd`, not `dragMove` events.
- **Complex state management for drag-drop:** dnd-kit handles most state; only manage the sorted array.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                  | Don't Build               | Use Instead            | Why                                    |
| ------------------------ | ------------------------- | ---------------------- | -------------------------------------- |
| Drag-drop reordering     | Custom mouse/touch events | @dnd-kit/sortable      | Accessibility, keyboard support, touch |
| Array reorder animation  | Manual CSS transitions    | dnd-kit `transform`    | Handled by library, smooth by default  |
| Keyboard-accessible drag | Custom keydown handlers   | dnd-kit KeyboardSensor | Built-in arrow key navigation          |
| Confirmation modals      | window.confirm()          | Custom modal component | Better UX, radio button selection      |
| ID generation            | Manual UUID library       | crypto.randomUUID()    | Native, no extra dependency            |

**Key insight:** dnd-kit abstracts away the complexity of accessible, touch-friendly drag-and-drop. Don't attempt to build custom drag behavior with raw DOM events.

## Common Pitfalls

### Pitfall 1: Sort Order Gaps After Deletion

**What goes wrong:** After deleting album at position 3 of [0,1,2,3,4], order becomes [0,1,2,4] with gap.
**Why it happens:** Deleting album doesn't renumber remaining items.
**How to avoid:** Gaps are fine; sortOrder is for ordering, not indexing. Only renumber on explicit reorder.
**Warning signs:** Paranoia about "fixing" gaps that don't affect functionality.

### Pitfall 2: Race Condition on Rapid Reorder

**What goes wrong:** User drags quickly multiple times; server receives out-of-order requests.
**Why it happens:** Multiple concurrent reorder API calls.
**How to avoid:** Use optimistic UI and only send one request at a time. Debounce rapid reorders or queue them.
**Warning signs:** Album order "jumps around" or reverts unexpectedly.

### Pitfall 3: Orphaned Photos After Album+Photos Delete

**What goes wrong:** Some photos not deleted if error occurs mid-batch.
**Why it happens:** Deleting photos one-by-one without transaction.
**How to avoid:** Delete album first (cascade removes junction entries), then delete photos. Log failures for manual cleanup.
**Warning signs:** Photos in database with no album assignments and no way to access them in UI.

### Pitfall 4: Cover Photo References Deleted Photo

**What goes wrong:** Album shows broken cover after its cover photo is deleted.
**Why it happens:** coverPhotoId not cleared when photo deleted.
**How to avoid:** Clear coverPhotoId in photo deletion logic if photo is a cover, OR rely on FK with SET NULL on delete.
**Warning signs:** Null pointer errors or 404s when loading album cover thumbnails.

### Pitfall 5: dnd-kit Key Prop Issues

**What goes wrong:** Dragging works once then breaks, or wrong item gets moved.
**Why it happens:** Using array index as React key instead of stable ID.
**How to avoid:** Always use `album.id` as key, never array index.
**Warning signs:** Console warnings about keys, erratic drag behavior.

## Code Examples

Verified patterns from official sources:

### Repository Extension for Photo Count and Reorder

```typescript
// src/infrastructure/database/repositories/SQLiteAlbumRepository.ts
import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { albums, photoAlbums } from "../schema";

export class SQLiteAlbumRepository implements AlbumRepository {
  // ... existing methods ...

  /**
   * Get photo count for each album
   * Returns map of albumId -> count
   */
  async getPhotoCounts(): Promise<Map<string, number>> {
    const results = await db
      .select({
        albumId: photoAlbums.albumId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(photoAlbums)
      .groupBy(photoAlbums.albumId);

    return new Map(results.map((r) => [r.albumId, r.count]));
  }

  /**
   * Update sort orders based on array position
   * albumIds[0] gets sortOrder 0, albumIds[1] gets sortOrder 1, etc.
   */
  async updateSortOrders(albumIds: string[]): Promise<void> {
    // Transaction for atomicity
    await db.transaction(async (tx) => {
      for (let i = 0; i < albumIds.length; i++) {
        await tx
          .update(albums)
          .set({ sortOrder: i })
          .where(eq(albums.id, albumIds[i]));
      }
    });
  }

  /**
   * Delete album and optionally all photos in it
   */
  async deleteWithPhotos(
    albumId: string,
    deletePhotos: boolean,
  ): Promise<{ deletedPhotoIds: string[] }> {
    const deletedPhotoIds: string[] = [];

    if (deletePhotos) {
      // Get photo IDs in this album
      const photoIds = await db
        .select({ photoId: photoAlbums.photoId })
        .from(photoAlbums)
        .where(eq(photoAlbums.albumId, albumId));

      deletedPhotoIds.push(...photoIds.map((p) => p.photoId));
    }

    // Delete album (cascade removes junction entries)
    await db.delete(albums).where(eq(albums.id, albumId));

    return { deletedPhotoIds };
  }
}
```

### Delete Album API with Photo Cleanup

```typescript
// src/app/api/admin/albums/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/infrastructure/auth";
import {
  SQLiteAlbumRepository,
  SQLitePhotoRepository,
} from "@/infrastructure/database/repositories";
import { deletePhotoFiles } from "@/infrastructure/storage";
import { revalidatePath } from "next/cache";

const albumRepository = new SQLiteAlbumRepository();
const photoRepository = new SQLitePhotoRepository();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: albumId } = await context.params;
  const body = (await request.json()) as { deletePhotos?: boolean };
  const deletePhotos = body.deletePhotos === true;

  // Verify album exists
  const album = await albumRepository.findById(albumId);
  if (!album) {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  // Delete album (and get photo IDs if deleting photos)
  const { deletedPhotoIds } = await albumRepository.deleteWithPhotos(
    albumId,
    deletePhotos,
  );

  // Delete photo files and records
  if (deletePhotos) {
    for (const photoId of deletedPhotoIds) {
      await deletePhotoFiles(photoId);
      await photoRepository.delete(photoId);
    }
  }

  revalidatePath("/admin/albums");
  revalidatePath("/admin");

  return new NextResponse(null, { status: 204 });
}
```

### Tags Input Component

```typescript
// src/presentation/components/TagsInput.tsx
'use client';

import { useState, KeyboardEvent } from 'react';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagsInput({ value, onChange, placeholder = 'Add tag...' }: Props) {
  const [input, setInput] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = input.trim();
      if (tag && !value.includes(tag)) {
        onChange([...value, tag]);
      }
      setInput('');
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((t) => t !== tagToRemove));
  };

  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-gray-300 p-2 focus-within:border-blue-500">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-sm"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] border-none outline-none text-sm"
      />
    </div>
  );
}
```

## State of the Art

| Old Approach                | Current Approach        | When Changed        | Impact                            |
| --------------------------- | ----------------------- | ------------------- | --------------------------------- |
| react-beautiful-dnd         | @dnd-kit                | 2022-2023           | Better a11y, maintained, smaller  |
| react-sortable-hoc          | @dnd-kit/sortable       | Deprecated 2023     | No findDOMNode, future-proof      |
| JSON array for tags         | Comma-separated TEXT    | Depends on use case | Simpler when querying not needed  |
| Separate confirm dialog lib | Custom modal with radio | N/A                 | Fewer deps, matches design system |

**Deprecated/outdated:**

- **react-beautiful-dnd:** No longer maintained; @dnd-kit is the successor
- **react-sortable-hoc:** Uses deprecated findDOMNode; migrate to @dnd-kit
- **SortableJS for React:** Works but @dnd-kit is more React-native

## Open Questions

Things that couldn't be fully resolved:

1. **Tag storage format**
   - What we know: Tags are free-form, admin creates any they want
   - What's unclear: Whether future phases might need to query by tag
   - Recommendation: Start with comma-separated TEXT. Easy to migrate to separate table later if querying needed.

2. **Schema migration for tags column**
   - What we know: Current schema doesn't have tags field
   - What's unclear: Whether to use Drizzle migrations or manual ALTER TABLE
   - Recommendation: Add column via initializeDatabase pattern (already used for schema). SQLite ALTER TABLE ADD COLUMN is safe.

3. **Cover photo deletion edge case**
   - What we know: coverPhotoId references photos.id
   - What's unclear: Current FK constraint behavior (CASCADE? SET NULL?)
   - Recommendation: Check existing constraint. If no SET NULL, add logic in photo delete to clear coverPhotoId.

## Sources

### Primary (HIGH confidence)

- [@dnd-kit Official Documentation](https://docs.dndkit.com/presets/sortable) - Sortable list implementation patterns
- Project codebase analysis - existing SQLiteAlbumRepository, schema.ts, API patterns from Phase 5
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/update) - Transaction and update patterns

### Secondary (MEDIUM confidence)

- [SQLite JSON Best Practices](https://www.beekeeperstudio.io/blog/sqlite-json) - Tags storage decision
- [dnd-kit GitHub](https://github.com/clauderic/dnd-kit) - Version info, package structure
- [Medium: Optimized Sort Order](https://medium.com/@ankit.chaudhary_/optimized-way-to-save-the-sort-order-into-db-using-sortablejs-vue-draggable-next-or-react-dnd-1cb690ebfa8a) - Batch reorder patterns

### Tertiary (LOW confidence)

- Web search results for React tags input components - community patterns
- Web search results for confirmation modal best practices - UX guidance

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - using existing project dependencies + well-established @dnd-kit
- Architecture: HIGH - patterns match existing codebase from Phase 5, dnd-kit docs verified
- Pitfalls: MEDIUM - based on dnd-kit documentation and SQLite patterns

**Research date:** 2026-01-31
**Valid until:** 60 days (stable domain, established libraries)
