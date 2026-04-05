import type { Album } from "../entities/Album";

export interface AlbumRepository {
  findById(id: string): Promise<Album | null>;
  findAll(): Promise<Album[]>;
  findPublished(): Promise<Album[]>;
  save(album: Album): Promise<void>;
  delete(id: string): Promise<void>;
  getPhotoCounts(): Promise<Map<string, number>>;
  updateSortOrders(albumIds: string[]): Promise<void>;
  deleteAlbumOnly(albumId: string): Promise<void>;
  deleteAlbumAndPhotos(albumId: string): Promise<{ deletedPhotoIds: string[] }>;
}
