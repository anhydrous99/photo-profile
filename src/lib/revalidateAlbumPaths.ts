import { revalidatePath } from "next/cache";

/**
 * Revalidate all album-related paths
 * Used after album create/update/delete operations
 */
export function revalidateAlbumPaths(albumId?: string): void {
  revalidatePath("/admin/albums");
  revalidatePath("/admin");
  revalidatePath("/albums");
  if (albumId) {
    revalidatePath(`/albums/${albumId}`);
  }
}
