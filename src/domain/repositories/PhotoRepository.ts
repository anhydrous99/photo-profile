import type { Photo } from "../entities/Photo";

export interface PhotoRepository {
  findById(id: string): Promise<Photo | null>;
  findAll(): Promise<Photo[]>;
  findByAlbumId(albumId: string): Promise<Photo[]>;
  save(photo: Photo): Promise<void>;
  delete(id: string): Promise<void>;
}
