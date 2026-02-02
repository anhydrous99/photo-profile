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

  // Random photo retrieval
  findRandomFromPublishedAlbums(limit: number): Promise<Photo[]>;
}
