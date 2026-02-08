import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { albums, photoAlbums } from "../schema";
import type { AlbumRepository } from "@/domain/repositories/AlbumRepository";
import type { Album } from "@/domain/entities/Album";

export class SQLiteAlbumRepository implements AlbumRepository {
  async findById(id: string): Promise<Album | null> {
    const result = await db
      .select()
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async findAll(): Promise<Album[]> {
    const results = await db.select().from(albums);
    return results.map((row) => this.toDomain(row));
  }

  async findPublished(): Promise<Album[]> {
    const results = await db
      .select()
      .from(albums)
      .where(eq(albums.isPublished, true));
    return results.map((row) => this.toDomain(row));
  }

  async save(album: Album): Promise<void> {
    await db
      .insert(albums)
      .values(this.toDatabase(album))
      .onConflictDoUpdate({
        target: albums.id,
        set: this.toDatabase(album),
      });
  }

  async delete(id: string): Promise<void> {
    await db.delete(albums).where(eq(albums.id, id));
  }

  /**
   * Get photo count for each album
   * Returns map of albumId -> count
   */
  async getPhotoCounts(): Promise<Map<string, number>> {
    const results = await db
      .select({
        albumId: photoAlbums.albumId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(photoAlbums)
      .groupBy(photoAlbums.albumId);

    return new Map(results.map((r) => [r.albumId, r.count]));
  }

  /**
   * Update sort orders based on array position
   * albumIds[0] gets sortOrder 0, albumIds[1] gets sortOrder 1, etc.
   */
  async updateSortOrders(albumIds: string[]): Promise<void> {
    db.transaction((tx) => {
      for (let i = 0; i < albumIds.length; i++) {
        tx.update(albums)
          .set({ sortOrder: i })
          .where(eq(albums.id, albumIds[i]))
          .run();
      }
    });
  }

  /**
   * Delete album and optionally return photo IDs for cascade deletion
   * If deletePhotos is true, returns photo IDs that should be deleted
   * The album deletion itself cascades to remove junction entries
   */
  async deleteWithPhotos(
    albumId: string,
    deletePhotos: boolean,
  ): Promise<{ deletedPhotoIds: string[] }> {
    const deletedPhotoIds: string[] = [];

    if (deletePhotos) {
      // Get photo IDs in this album before deleting
      const photoIds = await db
        .select({ photoId: photoAlbums.photoId })
        .from(photoAlbums)
        .where(eq(photoAlbums.albumId, albumId));

      deletedPhotoIds.push(...photoIds.map((p) => p.photoId));
    }

    // Delete album (cascade removes junction entries)
    await db.delete(albums).where(eq(albums.id, albumId));

    return { deletedPhotoIds };
  }

  private toDomain(row: typeof albums.$inferSelect): Album {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      tags: row.tags,
      coverPhotoId: row.coverPhotoId,
      sortOrder: row.sortOrder,
      isPublished: row.isPublished,
      createdAt: row.createdAt,
    };
  }

  private toDatabase(album: Album): typeof albums.$inferInsert {
    return {
      id: album.id,
      title: album.title,
      description: album.description,
      tags: album.tags,
      coverPhotoId: album.coverPhotoId,
      sortOrder: album.sortOrder,
      isPublished: album.isPublished,
      createdAt: album.createdAt,
    };
  }
}
