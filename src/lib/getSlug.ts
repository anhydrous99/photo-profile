/**
 * Extract photo slug from ID (first 8 characters)
 */
export function getSlug(photoId: string): string {
  return photoId.slice(0, 8);
}
