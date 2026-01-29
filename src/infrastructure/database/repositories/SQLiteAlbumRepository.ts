import { eq } from "drizzle-orm";
import { db } from "../client";
import { albums } from "../schema";
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

  private toDomain(row: typeof albums.$inferSelect): Album {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
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
      coverPhotoId: album.coverPhotoId,
      sortOrder: album.sortOrder,
      isPublished: album.isPublished,
      createdAt: album.createdAt,
    };
  }
}
