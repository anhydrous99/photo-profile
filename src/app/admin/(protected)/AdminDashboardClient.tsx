"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Photo, Album } from "@/domain/entities";
import { PhotoGrid, BatchActions } from "@/presentation/components";

interface AdminDashboardClientProps {
  photos: Photo[];
  albums: Album[];
}

/**
 * Client-side interactive portion of admin dashboard
 *
 * Manages:
 * - Photo selection state
 * - Batch operations (via BatchActions)
 * - Navigation to photo detail page
 */
export function AdminDashboardClient({
  photos,
  albums,
}: AdminDashboardClientProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleSelectionChange = (newSelectedIds: Set<string>) => {
    setSelectedIds(newSelectedIds);
  };

  const handlePhotoClick = (photoId: string) => {
    router.push(`/admin/photos/${photoId}`);
  };

  const handleBatchComplete = () => {
    // Clear selection and refresh the page to show updated photo list
    setSelectedIds(new Set());
    router.refresh();
  };

  return (
    <>
      <BatchActions
        selectedIds={selectedIds}
        albums={albums}
        onComplete={handleBatchComplete}
      />
      <PhotoGrid
        photos={photos}
        selectable={true}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onPhotoClick={handlePhotoClick}
      />
    </>
  );
}
