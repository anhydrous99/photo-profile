import type { Album } from '../entities/Album';

export interface AlbumRepository {
  findById(id: string): Promise<Album | null>;
  findAll(): Promise<Album[]>;
  findPublished(): Promise<Album[]>;
  save(album: Album): Promise<void>;
  delete(id: string): Promise<void>;
}
