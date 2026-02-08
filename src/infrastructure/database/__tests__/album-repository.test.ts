/**
 * Integration tests for SQLiteAlbumRepository.
 *
 * Tests full CRUD lifecycle, query methods, sort order operations,
 * deleteWithPhotos behavior, and toDomain/toDatabase round-trip
 * serialization edge cases against an in-memory SQLite database.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/__tests__/helpers/test-db";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/infrastructure/database/schema";
import type { Album } from "@/domain/entities/Album";
import type { Photo } from "@/domain/entities/Photo";

let testDb: BetterSQLite3Database<typeof schema>;
let testSqlite: Database.Database;

vi.mock("@/infrastructure/database/client", () => ({
  get db() {
    return testDb;
  },
}));

import { SQLiteAlbumRepository } from "@/infrastructure/database/repositories/SQLiteAlbumRepository";

// ---- Factories ----

let albumCounter = 0;
let photoCounter = 0;

function makeAlbum(overrides: Partial<Album> = {}): Album {
  albumCounter++;
  return {
    id: `test-album-${albumCounter}`,
    title: `Test Album ${albumCounter}`,
    description: null,
    tags: null,
    coverPhotoId: null,
    sortOrder: 0,
    isPublished: false,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makePhotoValues(
  overrides: Partial<{
    id: string;
    title: string | null;
    description: string | null;
    originalFilename: string;
    blurDataUrl: string | null;
    exifData: string | null;
    width: number | null;
    height: number | null;
    status: "processing" | "ready" | "error";
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  photoCounter++;
  return {
    id: `test-photo-${photoCounter}`,
    title: null,
    description: null,
    originalFilename: "test.jpg",
    blurDataUrl: null,
    exifData: null,
    width: null,
    height: null,
    status: "ready" as const,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---- Test suite ----

describe("SQLiteAlbumRepository", () => {
  let repo: SQLiteAlbumRepository;

  beforeEach(() => {
    albumCounter = 0;
    photoCounter = 0;
    const { db, sqlite } = createTestDb();
    testDb = db;
    testSqlite = sqlite;
    repo = new SQLiteAlbumRepository();
  });

  afterEach(() => {
    testSqlite.close();
  });

  // ---- CRUD basics ----

  describe("CRUD basics", () => {
    it("save() + findById() round-trips an album", async () => {
      const album = makeAlbum({
        title: "Landscapes",
        description: "Nature photos",
      });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(album.id);
      expect(result!.title).toBe("Landscapes");
      expect(result!.description).toBe("Nature photos");
      expect(result!.sortOrder).toBe(0);
      expect(result!.isPublished).toBe(false);
      expect(result!.createdAt.getTime()).toBe(album.createdAt.getTime());
    });

    it("findById() returns null for non-existent ID", async () => {
      const result = await repo.findById("non-existent-id");
      expect(result).toBeNull();
    });

    it("findAll() returns all saved albums", async () => {
      const a1 = makeAlbum();
      const a2 = makeAlbum();
      const a3 = makeAlbum();
      await repo.save(a1);
      await repo.save(a2);
      await repo.save(a3);

      const results = await repo.findAll();
      expect(results).toHaveLength(3);
      const ids = results.map((r) => r.id);
      expect(ids).toContain(a1.id);
      expect(ids).toContain(a2.id);
      expect(ids).toContain(a3.id);
    });

    it("save() on existing ID performs upsert", async () => {
      const album = makeAlbum({ title: "Original" });
      await repo.save(album);

      const updated = { ...album, title: "Updated" };
      await repo.save(updated);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Updated");
    });

    it("delete() removes album and findById() returns null", async () => {
      const album = makeAlbum();
      await repo.save(album);
      expect(await repo.findById(album.id)).not.toBeNull();

      await repo.delete(album.id);
      expect(await repo.findById(album.id)).toBeNull();
    });
  });

  // ---- Query methods ----

  describe("Query methods", () => {
    it("findPublished() returns only albums with isPublished: true", async () => {
      const published1 = makeAlbum({ isPublished: true });
      const published2 = makeAlbum({ isPublished: true });
      const unpublished = makeAlbum({ isPublished: false });
      await repo.save(published1);
      await repo.save(published2);
      await repo.save(unpublished);

      const results = await repo.findPublished();
      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id);
      expect(ids).toContain(published1.id);
      expect(ids).toContain(published2.id);
      expect(ids).not.toContain(unpublished.id);
    });

    it("getPhotoCounts() returns correct count per album", async () => {
      const album1 = makeAlbum();
      const album2 = makeAlbum();
      await repo.save(album1);
      await repo.save(album2);

      // Insert photos and junction entries via raw Drizzle
      const p1 = makePhotoValues();
      const p2 = makePhotoValues();
      const p3 = makePhotoValues();
      testDb.insert(schema.photos).values(p1).run();
      testDb.insert(schema.photos).values(p2).run();
      testDb.insert(schema.photos).values(p3).run();

      // album1 has 2 photos, album2 has 1 photo
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: p1.id, albumId: album1.id, sortOrder: 0 })
        .run();
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: p2.id, albumId: album1.id, sortOrder: 1 })
        .run();
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: p3.id, albumId: album2.id, sortOrder: 0 })
        .run();

      const counts = await repo.getPhotoCounts();
      expect(counts.get(album1.id)).toBe(2);
      expect(counts.get(album2.id)).toBe(1);
    });

    it("getPhotoCounts() returns empty Map when no junction entries exist", async () => {
      const album = makeAlbum();
      await repo.save(album);

      const counts = await repo.getPhotoCounts();
      expect(counts.size).toBe(0);
    });
  });

  // ---- Sort order operations ----

  describe("Sort order operations", () => {
    it("updateSortOrders() sets sortOrder based on array index", async () => {
      const a1 = makeAlbum({ sortOrder: 0 });
      const a2 = makeAlbum({ sortOrder: 1 });
      const a3 = makeAlbum({ sortOrder: 2 });
      await repo.save(a1);
      await repo.save(a2);
      await repo.save(a3);

      // Reverse the order
      await repo.updateSortOrders([a3.id, a2.id, a1.id]);

      const r1 = await repo.findById(a1.id);
      const r2 = await repo.findById(a2.id);
      const r3 = await repo.findById(a3.id);
      expect(r3!.sortOrder).toBe(0);
      expect(r2!.sortOrder).toBe(1);
      expect(r1!.sortOrder).toBe(2);
    });
  });

  // ---- deleteWithPhotos ----

  describe("deleteWithPhotos", () => {
    it("deleteWithPhotos(id, false) deletes album and junction entries but returns empty deletedPhotoIds", async () => {
      const album = makeAlbum();
      await repo.save(album);

      const photo = makePhotoValues();
      testDb.insert(schema.photos).values(photo).run();
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: photo.id, albumId: album.id, sortOrder: 0 })
        .run();

      const result = await repo.deleteWithPhotos(album.id, false);
      expect(result.deletedPhotoIds).toHaveLength(0);

      // Album should be deleted
      expect(await repo.findById(album.id)).toBeNull();

      // Junction entry should be cascade-deleted
      const junctions = testDb.select().from(schema.photoAlbums).all();
      expect(junctions).toHaveLength(0);

      // Photo record should still exist (not deleted)
      const photos = testDb.select().from(schema.photos).all();
      expect(photos).toHaveLength(1);
    });

    it("deleteWithPhotos(id, true) returns photo IDs that were in the album", async () => {
      const album = makeAlbum();
      await repo.save(album);

      const p1 = makePhotoValues();
      const p2 = makePhotoValues();
      testDb.insert(schema.photos).values(p1).run();
      testDb.insert(schema.photos).values(p2).run();
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: p1.id, albumId: album.id, sortOrder: 0 })
        .run();
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: p2.id, albumId: album.id, sortOrder: 1 })
        .run();

      const result = await repo.deleteWithPhotos(album.id, true);

      // Should return the photo IDs
      expect(result.deletedPhotoIds).toHaveLength(2);
      expect(result.deletedPhotoIds).toContain(p1.id);
      expect(result.deletedPhotoIds).toContain(p2.id);

      // Album should be deleted
      expect(await repo.findById(album.id)).toBeNull();

      // Photo records should still exist (caller is responsible for deletion)
      const photos = testDb.select().from(schema.photos).all();
      expect(photos).toHaveLength(2);
    });
  });

  // ---- Serialization edge cases (UNIT-02) ----

  describe("Serialization edge cases", () => {
    it("isPublished boolean round-trips correctly", async () => {
      const album = makeAlbum({ isPublished: true });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(typeof result!.isPublished).toBe("boolean");
      expect(result!.isPublished).toBe(true);
    });

    it("isPublished false round-trips as false (not falsy)", async () => {
      const album = makeAlbum({ isPublished: false });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.isPublished).toBe(false);
      expect(result!.isPublished).not.toBeNull();
    });

    it("null description round-trips as null", async () => {
      const album = makeAlbum({ description: null });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.description).toBeNull();
    });

    it("null tags round-trips as null", async () => {
      const album = makeAlbum({ tags: null });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.tags).toBeNull();
    });

    it("tags string round-trips correctly", async () => {
      const album = makeAlbum({ tags: "landscape,nature,2024" });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.tags).toBe("landscape,nature,2024");
    });

    it("null coverPhotoId round-trips as null", async () => {
      const album = makeAlbum({ coverPhotoId: null });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.coverPhotoId).toBeNull();
    });

    it("coverPhotoId with valid photo round-trips correctly", async () => {
      // Save photo first (FK constraint)
      const photo = makePhotoValues();
      testDb.insert(schema.photos).values(photo).run();

      const album = makeAlbum({ coverPhotoId: photo.id });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.coverPhotoId).toBe(photo.id);
    });

    it("timestamp precision is preserved via getTime()", async () => {
      const knownDate = new Date("2024-06-15T14:30:45.123Z");
      const album = makeAlbum({ createdAt: knownDate });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.createdAt.getTime()).toBe(knownDate.getTime());
    });

    it("sortOrder preserves exact integer value", async () => {
      const album = makeAlbum({ sortOrder: 42 });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.sortOrder).toBe(42);
    });
  });
});
