import { revalidatePath, revalidateTag } from "next/cache";
import { PHOTO_POOL_CACHE_TAG } from "@/lib/constants";

/**
 * Revalidate all album-related paths
 * Used after album create/update/delete operations
 */
export function revalidateAlbumPaths(albumId?: string): void {
  revalidatePath("/admin/albums");
  revalidatePath("/admin");
  revalidatePath("/albums");
  revalidatePath("/");
  revalidatePath("/photo", "layout");
  if (albumId) {
    revalidatePath(`/albums/${albumId}`);
    revalidatePath(`/albums/${albumId}/photo`, "page");
  }
  revalidateTag(PHOTO_POOL_CACHE_TAG, { expire: 300 });
}
