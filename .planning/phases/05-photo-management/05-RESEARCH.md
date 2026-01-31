# Phase 5: Photo Management - Research

**Researched:** 2026-01-31
**Domain:** Admin CRUD operations (editing, album assignment, deletion with file cleanup)
**Confidence:** HIGH

## Summary

This phase implements photo management capabilities for the admin: editing photo descriptions, assigning photos to albums, and deleting photos with file cleanup. Research focused on three areas: (1) auto-save on blur patterns for description editing, (2) many-to-many album assignment using the existing junction table, and (3) cascading file deletion.

The project already has a solid foundation from Phase 4: SQLite with Drizzle ORM, Server Actions with `useActionState`, Tailwind CSS styling, and a storage structure at `storage/originals/{photoId}/` and `storage/processed/{photoId}/`. The existing `photoAlbums` junction table supports many-to-many relationships with cascade delete on foreign keys.

**Primary recommendation:** Use Server Actions with `revalidatePath` for all mutations. Implement auto-save on blur using a simple debounced Server Action pattern. For deletion, use Node.js `fs.rm` with `recursive: true` to clean both `originals/{photoId}` and `processed/{photoId}` directories after database deletion.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)

| Library     | Version | Purpose                 | Why Standard                                                |
| ----------- | ------- | ----------------------- | ----------------------------------------------------------- |
| Next.js     | 16.1.6  | Server Actions, routing | Already in use; Server Actions are ideal for form mutations |
| drizzle-orm | 0.45.1  | Database operations     | Already configured with junction table `photoAlbums`        |
| React       | 19.2.3  | UI, hooks               | `useOptimistic`, `useActionState` for form state            |
| Zod         | 4.3.6   | Validation              | Already used in auth actions                                |

### Supporting (Already Installed)

| Library             | Version | Purpose       | When to Use                                       |
| ------------------- | ------- | ------------- | ------------------------------------------------- |
| Node.js fs/promises | native  | File deletion | `rm` with `recursive: true` for directory cleanup |

### No New Dependencies Needed

This phase requires no new npm packages. All functionality can be built with:

- Native React 19 hooks (`useOptimistic`, `useActionState`, `startTransition`)
- Next.js Server Actions with `revalidatePath`
- Native Node.js `fs/promises` for file operations
- Existing Drizzle ORM patterns for database operations

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── admin/(protected)/
│   │   ├── page.tsx                    # Existing dashboard (modify for multi-select)
│   │   └── photos/
│   │       └── [id]/
│   │           └── page.tsx            # NEW: Photo detail/edit page
│   └── actions/
│       └── photos.ts                   # NEW: Server Actions for photo CRUD
├── presentation/
│   └── components/
│       ├── PhotoGrid.tsx               # Modify: add multi-select capability
│       ├── PhotoDetail.tsx             # NEW: Photo detail view + edit form
│       ├── AlbumSelector.tsx           # NEW: Multi-album selection UI
│       └── ConfirmDialog.tsx           # NEW: Reusable deletion confirmation
└── infrastructure/
    └── storage/
        └── fileStorage.ts              # Modify: add deletePhotoFiles function
```

### Pattern 1: Auto-Save on Blur with Server Actions

**What:** Description field saves automatically when user clicks/tabs away.
**When to use:** Single-field edits that should feel seamless.

**Example:**

```typescript
// src/app/actions/photos.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories";

const updateDescriptionSchema = z.object({
  photoId: z.string().uuid(),
  description: z.string().max(2000).nullable(),
});

export async function updatePhotoDescription(formData: FormData) {
  const validated = updateDescriptionSchema.safeParse({
    photoId: formData.get("photoId"),
    description: formData.get("description") || null,
  });

  if (!validated.success) {
    return { error: "Invalid data" };
  }

  const repository = new SQLitePhotoRepository();
  const photo = await repository.findById(validated.data.photoId);

  if (!photo) {
    return { error: "Photo not found" };
  }

  photo.description = validated.data.description;
  photo.updatedAt = new Date();
  await repository.save(photo);

  revalidatePath(`/admin/photos/${validated.data.photoId}`);
  revalidatePath("/admin");

  return { success: true };
}
```

**Client Component:**

```typescript
// src/presentation/components/PhotoDetail.tsx
'use client';

import { useRef, useCallback } from 'react';
import { updatePhotoDescription } from '@/app/actions/photos';

interface Props {
  photo: Photo;
}

export function DescriptionEditor({ photo }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  const handleBlur = useCallback(() => {
    if (formRef.current) {
      // Submit form on blur - auto-save behavior
      formRef.current.requestSubmit();
    }
  }, []);

  return (
    <form ref={formRef} action={updatePhotoDescription}>
      <input type="hidden" name="photoId" value={photo.id} />
      <textarea
        name="description"
        defaultValue={photo.description ?? ''}
        onBlur={handleBlur}
        placeholder="Add a description..."
        className="w-full rounded border px-3 py-2 focus:border-blue-500 focus:outline-none"
      />
      {/* No submit button - auto-saves on blur */}
    </form>
  );
}
```

### Pattern 2: Many-to-Many Album Assignment

**What:** Add/remove photos from albums using the `photoAlbums` junction table.
**When to use:** Any album assignment operation (single photo or batch).

**Schema Reference (already exists):**

```typescript
// Junction table with cascade delete already configured
export const photoAlbums = sqliteTable(
  "photo_albums",
  {
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.photoId, table.albumId] })],
);
```

**Server Action:**

```typescript
// src/app/actions/photos.ts
"use server";

import { db } from "@/infrastructure/database/client";
import { photoAlbums } from "@/infrastructure/database/schema";
import { eq, and } from "drizzle-orm";

export async function updatePhotoAlbums(
  photoId: string,
  albumIds: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    // Transaction: remove all existing, add new assignments
    await db.transaction(async (tx) => {
      // Remove existing album assignments for this photo
      await tx.delete(photoAlbums).where(eq(photoAlbums.photoId, photoId));

      // Add new assignments
      if (albumIds.length > 0) {
        await tx.insert(photoAlbums).values(
          albumIds.map((albumId, index) => ({
            photoId,
            albumId,
            sortOrder: index,
          })),
        );
      }
    });

    revalidatePath(`/admin/photos/${photoId}`);
    revalidatePath("/admin");

    return { success: true };
  } catch (error) {
    return { error: "Failed to update albums" };
  }
}

// For batch operations from grid
export async function batchUpdatePhotoAlbums(
  photoIds: string[],
  albumId: string,
  action: "add" | "remove",
): Promise<{ success: boolean; error?: string }> {
  try {
    if (action === "add") {
      // Add all photos to album (ignore duplicates)
      await db
        .insert(photoAlbums)
        .values(photoIds.map((photoId) => ({ photoId, albumId, sortOrder: 0 })))
        .onConflictDoNothing();
    } else {
      // Remove all photos from album
      for (const photoId of photoIds) {
        await db
          .delete(photoAlbums)
          .where(
            and(
              eq(photoAlbums.photoId, photoId),
              eq(photoAlbums.albumId, albumId),
            ),
          );
      }
    }

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { error: "Failed to update albums" };
  }
}
```

### Pattern 3: Photo Deletion with File Cleanup

**What:** Delete photo record and all associated files (originals + derivatives).
**When to use:** Admin explicitly deletes a photo.

**File Structure to Clean:**

```
storage/
├── originals/{photoId}/       # Contains original.{ext}
│   └── original.jpg
└── processed/{photoId}/       # Contains all derivatives
    ├── 300w.webp
    ├── 300w.avif
    ├── 600w.webp
    ├── 600w.avif
    ├── 1200w.webp
    ├── 1200w.avif
    ├── 2400w.webp
    └── 2400w.avif
```

**Server Action:**

```typescript
// src/app/actions/photos.ts
"use server";

import { rm } from "fs/promises";
import { join } from "path";
import { env } from "@/infrastructure/config/env";
import { SQLitePhotoRepository } from "@/infrastructure/database/repositories";
import { revalidatePath } from "next/cache";

export async function deletePhoto(
  photoId: string,
): Promise<{ success: boolean; error?: string }> {
  const repository = new SQLitePhotoRepository();

  // Verify photo exists
  const photo = await repository.findById(photoId);
  if (!photo) {
    return { error: "Photo not found" };
  }

  try {
    // 1. Delete database record first (cascades to photoAlbums)
    await repository.delete(photoId);

    // 2. Delete files (both directories)
    const originalsDir = join(env.STORAGE_PATH, "originals", photoId);
    const processedDir = join(env.STORAGE_PATH, "processed", photoId);

    // Use rm with recursive and force to handle missing directories gracefully
    await Promise.all([
      rm(originalsDir, { recursive: true, force: true }),
      rm(processedDir, { recursive: true, force: true }),
    ]);

    revalidatePath("/admin");

    return { success: true };
  } catch (error) {
    console.error("Delete failed:", error);
    return { error: "Failed to delete photo" };
  }
}

// Batch delete
export async function batchDeletePhotos(
  photoIds: string[],
): Promise<{ success: boolean; deleted: number; errors: string[] }> {
  const errors: string[] = [];
  let deleted = 0;

  for (const photoId of photoIds) {
    const result = await deletePhoto(photoId);
    if (result.success) {
      deleted++;
    } else {
      errors.push(`${photoId}: ${result.error}`);
    }
  }

  return { success: errors.length === 0, deleted, errors };
}
```

### Pattern 4: Confirmation Dialog (Simple Hook)

**What:** Reusable confirmation before destructive actions.
**When to use:** Photo deletion, batch operations.

**Example:**

```typescript
// src/presentation/components/ConfirmDialog.tsx
'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    open: false,
    options: { title: '', message: '' },
    resolve: null,
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, options, resolve });
    });
  }, []);

  const handleConfirm = () => {
    state.resolve?.(true);
    setState(s => ({ ...s, open: false, resolve: null }));
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setState(s => ({ ...s, open: false, resolve: null }));
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{state.options.title}</h2>
            <p className="mt-2 text-gray-600">{state.options.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={handleCancel}
                className="rounded px-4 py-2 text-gray-600 hover:bg-gray-100"
              >
                {state.options.cancelText || 'Cancel'}
              </button>
              <button
                onClick={handleConfirm}
                className={`rounded px-4 py-2 text-white ${
                  state.options.destructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {state.options.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider');
  return context.confirm;
}
```

### Pattern 5: Grid Multi-Select

**What:** Select multiple photos for batch operations.
**When to use:** Batch album assignment, batch deletion.

**Example:**

```typescript
// src/presentation/components/PhotoGrid.tsx (modified)
'use client';

import { useState, useCallback } from 'react';

interface Props {
  photos: Photo[];
  selectable?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
}

export function PhotoGrid({ photos, selectable = false, onSelectionChange }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback((photoId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      onSelectionChange?.(Array.from(next));
      return next;
    });
  }, [onSelectionChange]);

  const selectAll = useCallback(() => {
    const allIds = photos.map(p => p.id);
    setSelected(new Set(allIds));
    onSelectionChange?.(allIds);
  }, [photos, onSelectionChange]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  return (
    <div>
      {selectable && (
        <div className="mb-4 flex gap-2">
          <button onClick={selectAll} className="text-sm text-blue-600">
            Select All
          </button>
          <button onClick={clearSelection} className="text-sm text-gray-600">
            Clear
          </button>
          <span className="text-sm text-gray-500">
            {selected.size} selected
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            selectable={selectable}
            selected={selected.has(photo.id)}
            onSelect={() => toggleSelection(photo.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Deleting files before database:** Always delete DB record first. If file deletion fails, you can retry later; orphaned files are better than orphaned DB records.
- **Not using `force: true` with `rm`:** Without force, missing directories throw errors. Use `{ recursive: true, force: true }`.
- **Manual refresh after mutations:** Use `revalidatePath()` instead of client-side refresh or router.refresh().
- **Complex debounce for auto-save:** Simple `onBlur` with form submission is cleaner than debounce timers for single-field saves.
- **Confirmation for every action:** Only require confirmation for destructive actions (delete). Edits/assignments should be seamless.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem               | Don't Build                    | Use Instead                       | Why                                   |
| --------------------- | ------------------------------ | --------------------------------- | ------------------------------------- |
| Form state management | Custom useState for each field | Server Actions + `useActionState` | Built-in pending states, validation   |
| Optimistic updates    | Manual state management        | React 19 `useOptimistic`          | Auto-rollback on error, built-in      |
| Confirmation dialogs  | Alert/confirm native dialogs   | Context-based modal pattern       | Accessible, customizable, consistent  |
| Junction table CRUD   | Custom SQL queries             | Drizzle ORM insert/delete         | Type-safe, handles escaping           |
| Directory deletion    | Manual file iteration          | `fs.rm({ recursive: true })`      | Handles nested files, race conditions |

**Key insight:** React 19 and Next.js 16 provide first-class primitives for forms and mutations. Leverage `useActionState`, `useOptimistic`, Server Actions, and `revalidatePath` instead of building custom state management.

## Common Pitfalls

### Pitfall 1: Race Conditions in Batch Operations

**What goes wrong:** Concurrent batch operations corrupt state or skip items.
**Why it happens:** Multiple async operations without coordination.
**How to avoid:** Use database transactions for related operations. Process batch items sequentially for file operations (parallel file I/O can exhaust file descriptors).
**Warning signs:** Inconsistent counts, "file not found" errors during batch delete.

### Pitfall 2: Orphaned Files After Failed Deletion

**What goes wrong:** Database record deleted but files remain.
**Why it happens:** File deletion throws error after DB deletion.
**How to avoid:** Use `force: true` with `fs.rm` to ignore missing files. Log failures for manual cleanup rather than blocking.
**Warning signs:** Storage usage growing despite photo count decreasing.

### Pitfall 3: Stale UI After Mutations

**What goes wrong:** User sees old data after save/delete.
**Why it happens:** Missing `revalidatePath()` calls.
**How to avoid:** Always call `revalidatePath()` for affected routes after mutations. Include both detail page and list page paths.
**Warning signs:** Users refreshing page to see changes.

### Pitfall 4: Lost Changes on Auto-Save

**What goes wrong:** User types, clicks away too fast, changes not saved.
**Why it happens:** Network latency + immediate navigation.
**How to avoid:** Show subtle saving indicator. Consider `onBeforeUnload` warning if pending changes.
**Warning signs:** User complaints about lost descriptions.

### Pitfall 5: N+1 Queries in Album Display

**What goes wrong:** Loading 100 photos with albums makes 101 database queries.
**Why it happens:** Fetching albums for each photo separately.
**How to avoid:** Use Drizzle relations or single JOIN query to fetch photos with their albums.
**Warning signs:** Slow page loads, database connection exhaustion.

## Code Examples

Verified patterns from official sources:

### useOptimistic for Delete

```typescript
// Source: https://react.dev/reference/react/useOptimistic
'use client';

import { useOptimistic, startTransition } from 'react';
import { deletePhoto } from '@/app/actions/photos';
import { useConfirm } from './ConfirmDialog';

export function PhotoGrid({ photos }: { photos: Photo[] }) {
  const [optimisticPhotos, removePhoto] = useOptimistic(
    photos,
    (current, photoId: string) => current.filter(p => p.id !== photoId)
  );

  const confirm = useConfirm();

  async function handleDelete(photoId: string) {
    const confirmed = await confirm({
      title: 'Delete Photo',
      message: 'This will permanently delete the photo and all its files.',
      confirmText: 'Delete',
      destructive: true,
    });

    if (!confirmed) return;

    startTransition(async () => {
      removePhoto(photoId);  // Optimistic: remove immediately
      await deletePhoto(photoId);  // Server: delete for real
      // UI auto-reverts if deletePhoto throws
    });
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {optimisticPhotos.map(photo => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          onDelete={() => handleDelete(photo.id)}
        />
      ))}
    </div>
  );
}
```

### Repository Method for Photos with Albums

```typescript
// Add to SQLitePhotoRepository
async findByIdWithAlbums(id: string): Promise<PhotoWithAlbums | null> {
  const result = await db
    .select({
      photo: photos,
      albumId: photoAlbums.albumId,
      albumTitle: albums.title,
    })
    .from(photos)
    .leftJoin(photoAlbums, eq(photos.id, photoAlbums.photoId))
    .leftJoin(albums, eq(photoAlbums.albumId, albums.id))
    .where(eq(photos.id, id));

  if (result.length === 0) return null;

  const photo = this.toDomain(result[0].photo);
  const photoAlbums = result
    .filter(r => r.albumId !== null)
    .map(r => ({ id: r.albumId!, title: r.albumTitle! }));

  return { ...photo, albums: photoAlbums };
}
```

### File Deletion Utility

```typescript
// src/infrastructure/storage/fileStorage.ts
import { rm } from "fs/promises";
import { join } from "path";
import { env } from "@/infrastructure/config/env";

/**
 * Delete all files associated with a photo
 *
 * Removes:
 * - storage/originals/{photoId}/ (original file)
 * - storage/processed/{photoId}/ (all derivatives)
 *
 * Uses force: true to ignore already-deleted files (idempotent).
 */
export async function deletePhotoFiles(photoId: string): Promise<void> {
  const originalsDir = join(env.STORAGE_PATH, "originals", photoId);
  const processedDir = join(env.STORAGE_PATH, "processed", photoId);

  await Promise.all([
    rm(originalsDir, { recursive: true, force: true }),
    rm(processedDir, { recursive: true, force: true }),
  ]);
}
```

## State of the Art

| Old Approach                    | Current Approach                    | When Changed   | Impact                           |
| ------------------------------- | ----------------------------------- | -------------- | -------------------------------- |
| useEffect + fetch for mutations | Server Actions                      | Next.js 14+    | Simpler, progressive enhancement |
| Custom debounce hooks           | Native form onBlur                  | React patterns | Less code, fewer bugs            |
| Manual optimistic UI            | `useOptimistic` hook                | React 19       | Auto-rollback, less state        |
| `rimraf` package                | Native `fs.rm({ recursive: true })` | Node.js 14+    | Zero dependencies                |

**Deprecated/outdated:**

- **fetch for mutations in Client Components:** Server Actions are the recommended pattern for form mutations in Next.js 14+
- **useReducer for form state:** `useActionState` replaces complex reducers for form submissions
- **Manual state reversion on error:** `useOptimistic` handles this automatically

## Open Questions

Things that couldn't be fully resolved:

1. **Soft delete vs hard delete**
   - What we know: Hard delete requested in phase requirements; current schema has no `deletedAt` field
   - What's unclear: Whether soft delete might be wanted later for "trash" feature
   - Recommendation: Implement hard delete per requirements. Add soft delete in future phase if needed.

2. **Album sort order on assignment**
   - What we know: `photoAlbums.sortOrder` exists but purpose unclear
   - What's unclear: Whether photos should be ordered within albums, or just existence matters
   - Recommendation: Default sortOrder to 0 for now. Add drag-drop reordering in Phase 6 if needed.

3. **Title field editing**
   - What we know: `photos.title` column exists but not mentioned in requirements
   - What's unclear: Whether admin should edit title or just description
   - Recommendation: Include title editing in detail page (same auto-save pattern). Low cost, high flexibility.

## Sources

### Primary (HIGH confidence)

- Project codebase analysis - existing patterns, schema, storage structure
- [React useOptimistic](https://react.dev/reference/react/useOptimistic) - official documentation
- [Next.js Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) - official documentation
- [Drizzle ORM Relations](https://orm.drizzle.team/docs/relations) - junction table patterns

### Secondary (MEDIUM confidence)

- [Node.js fs.rm](https://nodejs.org/api/fs.html#fspromisesrmpath-options) - official documentation
- [React Hook Form onBlur discussions](https://github.com/orgs/react-hook-form/discussions/2494) - community patterns

### Tertiary (LOW confidence)

- Web search results for confirmation dialog patterns - community patterns, not official

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - using existing project dependencies, no new packages
- Architecture: HIGH - patterns verified against Next.js 16 and React 19 official docs
- Pitfalls: MEDIUM - based on experience and community patterns

**Research date:** 2026-01-31
**Valid until:** 60 days (stable domain, existing stack)
