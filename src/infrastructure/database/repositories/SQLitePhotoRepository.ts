import { eq } from 'drizzle-orm';
import { db } from '../client';
import { photos, photoAlbums } from '../schema';
import type { PhotoRepository } from '@/domain/repositories/PhotoRepository';
import type { Photo } from '@/domain/entities/Photo';

export class SQLitePhotoRepository implements PhotoRepository {
  async findById(id: string): Promise<Photo | null> {
    const result = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async findAll(): Promise<Photo[]> {
    const results = await db.select().from(photos);
    return results.map((row) => this.toDomain(row));
  }

  async findByAlbumId(albumId: string): Promise<Photo[]> {
    const results = await db
      .select({ photo: photos })
      .from(photos)
      .innerJoin(photoAlbums, eq(photos.id, photoAlbums.photoId))
      .where(eq(photoAlbums.albumId, albumId));
    return results.map((r) => this.toDomain(r.photo));
  }

  async save(photo: Photo): Promise<void> {
    await db
      .insert(photos)
      .values(this.toDatabase(photo))
      .onConflictDoUpdate({
        target: photos.id,
        set: { ...this.toDatabase(photo), updatedAt: new Date() },
      });
  }

  async delete(id: string): Promise<void> {
    await db.delete(photos).where(eq(photos.id, id));
  }

  private toDomain(row: typeof photos.$inferSelect): Photo {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      originalFilename: row.originalFilename,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toDatabase(photo: Photo): typeof photos.$inferInsert {
    return {
      id: photo.id,
      title: photo.title,
      description: photo.description,
      originalFilename: photo.originalFilename,
      status: photo.status,
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
    };
  }
}
