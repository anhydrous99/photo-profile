import type { Photo } from "../entities/Photo";

export interface PhotoRepository {
  findById(id: string): Promise<Photo | null>;
  findAll(): Promise<Photo[]>;
  findByAlbumId(albumId: string): Promise<Photo[]>;
  save(photo: Photo): Promise<void>;
  delete(id: string): Promise<void>;

  // Album membership methods
  getAlbumIds(photoId: string): Promise<string[]>;
  addToAlbum(photoId: string, albumId: string): Promise<void>;
  removeFromAlbum(photoId: string, albumId: string): Promise<void>;
  updatePhotoSortOrders(albumId: string, photoIds: string[]): Promise<void>;

  // Random photo retrieval
  findRandomFromPublishedAlbums(limit: number): Promise<Photo[]>;

  // Slug-based lookup (first 8 chars of UUID)
  findBySlugPrefix(slug: string): Promise<Photo | null>;

  // Status filtering and stale detection
  findByStatus(status: Photo["status"]): Promise<Photo[]>;
  findStaleProcessing(thresholdMs: number): Promise<Photo[]>;
}
