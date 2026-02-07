import { and, eq, like, sql } from "drizzle-orm";
import { db } from "../client";
import { photos, photoAlbums, albums } from "../schema";
import type { PhotoRepository } from "@/domain/repositories/PhotoRepository";
import type { Photo, ExifData } from "@/domain/entities/Photo";

export class SQLitePhotoRepository implements PhotoRepository {
  async findById(id: string): Promise<Photo | null> {
    const result = await db
      .select()
      .from(photos)
      .where(eq(photos.id, id))
      .limit(1);
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
      .where(eq(photoAlbums.albumId, albumId))
      .orderBy(photoAlbums.sortOrder);
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

  async getAlbumIds(photoId: string): Promise<string[]> {
    const results = await db
      .select({ albumId: photoAlbums.albumId })
      .from(photoAlbums)
      .where(eq(photoAlbums.photoId, photoId));
    return results.map((r) => r.albumId);
  }

  async addToAlbum(photoId: string, albumId: string): Promise<void> {
    const [{ maxOrder }] = await db
      .select({
        maxOrder: sql<number | null>`max(${photoAlbums.sortOrder})`,
      })
      .from(photoAlbums)
      .where(eq(photoAlbums.albumId, albumId));
    const nextOrder = (maxOrder ?? -1) + 1;
    await db
      .insert(photoAlbums)
      .values({ photoId, albumId, sortOrder: nextOrder })
      .onConflictDoNothing();
  }

  async removeFromAlbum(photoId: string, albumId: string): Promise<void> {
    await db
      .delete(photoAlbums)
      .where(
        and(eq(photoAlbums.photoId, photoId), eq(photoAlbums.albumId, albumId)),
      );
  }

  async updatePhotoSortOrders(
    albumId: string,
    photoIds: string[],
  ): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < photoIds.length; i++) {
        await tx
          .update(photoAlbums)
          .set({ sortOrder: i })
          .where(
            and(
              eq(photoAlbums.albumId, albumId),
              eq(photoAlbums.photoId, photoIds[i]),
            ),
          );
      }
    });
  }

  async findBySlugPrefix(slug: string): Promise<Photo | null> {
    const result = await db
      .select()
      .from(photos)
      .where(like(photos.id, `${slug}%`))
      .limit(1);
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async findRandomFromPublishedAlbums(limit: number): Promise<Photo[]> {
    const results = await db
      .select({ photo: photos })
      .from(photos)
      .innerJoin(photoAlbums, eq(photos.id, photoAlbums.photoId))
      .innerJoin(albums, eq(photoAlbums.albumId, albums.id))
      .where(and(eq(photos.status, "ready"), eq(albums.isPublished, true)))
      .groupBy(photos.id)
      .orderBy(sql`RANDOM()`)
      .limit(limit);

    return results.map((r) => this.toDomain(r.photo));
  }

  private safeParseExifJson(json: string): ExifData | null {
    try {
      return JSON.parse(json) as ExifData;
    } catch {
      console.error("[SQLitePhotoRepository] Failed to parse exifData JSON");
      return null;
    }
  }

  private toDomain(row: typeof photos.$inferSelect): Photo {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      originalFilename: row.originalFilename,
      blurDataUrl: row.blurDataUrl,
      exifData: row.exifData ? this.safeParseExifJson(row.exifData) : null,
      width: row.width ?? null,
      height: row.height ?? null,
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
      blurDataUrl: photo.blurDataUrl,
      exifData: photo.exifData ? JSON.stringify(photo.exifData) : null,
      width: photo.width,
      height: photo.height,
      status: photo.status,
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
    };
  }
}
