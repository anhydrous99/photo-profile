/**
 * Integration tests for SQLitePhotoRepository.
 *
 * Tests full CRUD lifecycle, junction table operations, and
 * toDomain/toDatabase round-trip serialization edge cases against
 * an in-memory SQLite database via createTestDb().
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/__tests__/helpers/test-db";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/infrastructure/database/schema";
import type { Photo, ExifData } from "@/domain/entities/Photo";

let testDb: BetterSQLite3Database<typeof schema>;
let testSqlite: Database.Database;

vi.mock("@/infrastructure/database/client", () => ({
  get db() {
    return testDb;
  },
}));

import { SQLitePhotoRepository } from "@/infrastructure/database/repositories/SQLitePhotoRepository";

// ---- Factories ----

let photoCounter = 0;
let albumCounter = 0;

function makePhoto(overrides: Partial<Photo> = {}): Photo {
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
    status: "ready",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeAlbumValues(
  overrides: Partial<{
    id: string;
    title: string;
    description: string | null;
    tags: string | null;
    coverPhotoId: string | null;
    sortOrder: number;
    isPublished: boolean;
    createdAt: Date;
  }> = {},
) {
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

// ---- Test suite ----

describe("SQLitePhotoRepository", () => {
  let repo: SQLitePhotoRepository;

  beforeEach(() => {
    photoCounter = 0;
    albumCounter = 0;
    const { db, sqlite } = createTestDb();
    testDb = db;
    testSqlite = sqlite;
    repo = new SQLitePhotoRepository();
  });

  afterEach(() => {
    testSqlite.close();
  });

  // ---- CRUD basics ----

  describe("CRUD basics", () => {
    it("save() + findById() round-trips a photo", async () => {
      const photo = makePhoto({ title: "Sunset", description: "A sunset" });
      await repo.save(photo);

      const result = await repo.findById(photo.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(photo.id);
      expect(result!.title).toBe("Sunset");
      expect(result!.description).toBe("A sunset");
      expect(result!.originalFilename).toBe("test.jpg");
      expect(result!.status).toBe("ready");
      expect(result!.createdAt.getTime()).toBe(photo.createdAt.getTime());
    });

    it("findById() returns null for non-existent ID", async () => {
      const result = await repo.findById("non-existent-id");
      expect(result).toBeNull();
    });

    it("findAll() returns all saved photos", async () => {
      const p1 = makePhoto();
      const p2 = makePhoto();
      const p3 = makePhoto();
      await repo.save(p1);
      await repo.save(p2);
      await repo.save(p3);

      const results = await repo.findAll();
      expect(results).toHaveLength(3);
      const ids = results.map((r) => r.id);
      expect(ids).toContain(p1.id);
      expect(ids).toContain(p2.id);
      expect(ids).toContain(p3.id);
    });

    it("save() on existing ID performs upsert", async () => {
      const photo = makePhoto({ description: "original" });
      await repo.save(photo);

      const updated = { ...photo, description: "updated" };
      await repo.save(updated);

      const result = await repo.findById(photo.id);
      expect(result).not.toBeNull();
      expect(result!.description).toBe("updated");
    });

    it("delete() removes photo and findById() returns null", async () => {
      const photo = makePhoto();
      await repo.save(photo);
      expect(await repo.findById(photo.id)).not.toBeNull();

      await repo.delete(photo.id);
      expect(await repo.findById(photo.id)).toBeNull();
    });
  });

  // ---- Junction table operations ----

  describe("Junction table operations", () => {
    it("addToAlbum() + getAlbumIds() links photo to album", async () => {
      const photo = makePhoto();
      await repo.save(photo);
      const album = makeAlbumValues();
      testDb.insert(schema.albums).values(album).run();

      await repo.addToAlbum(photo.id, album.id);
      const albumIds = await repo.getAlbumIds(photo.id);
      expect(albumIds).toContain(album.id);
      expect(albumIds).toHaveLength(1);
    });

    it("addToAlbum() twice to same album is idempotent", async () => {
      const photo = makePhoto();
      await repo.save(photo);
      const album = makeAlbumValues();
      testDb.insert(schema.albums).values(album).run();

      await repo.addToAlbum(photo.id, album.id);
      await repo.addToAlbum(photo.id, album.id);

      const albumIds = await repo.getAlbumIds(photo.id);
      expect(albumIds).toHaveLength(1);
    });

    it("removeFromAlbum() removes the association", async () => {
      const photo = makePhoto();
      await repo.save(photo);
      const album = makeAlbumValues();
      testDb.insert(schema.albums).values(album).run();

      await repo.addToAlbum(photo.id, album.id);
      expect(await repo.getAlbumIds(photo.id)).toHaveLength(1);

      await repo.removeFromAlbum(photo.id, album.id);
      expect(await repo.getAlbumIds(photo.id)).toHaveLength(0);
    });

    it("findByAlbumId() returns photos ordered by sortOrder", async () => {
      const p1 = makePhoto();
      const p2 = makePhoto();
      const p3 = makePhoto();
      await repo.save(p1);
      await repo.save(p2);
      await repo.save(p3);

      const album = makeAlbumValues();
      testDb.insert(schema.albums).values(album).run();

      // Add in reverse order so sortOrder matters
      await repo.addToAlbum(p3.id, album.id);
      await repo.addToAlbum(p1.id, album.id);
      await repo.addToAlbum(p2.id, album.id);

      const results = await repo.findByAlbumId(album.id);
      expect(results).toHaveLength(3);
      // sortOrder assigned incrementally: p3=0, p1=1, p2=2
      expect(results[0].id).toBe(p3.id);
      expect(results[1].id).toBe(p1.id);
      expect(results[2].id).toBe(p2.id);
    });

    it("updatePhotoSortOrders() reorders photos within an album", async () => {
      const p1 = makePhoto();
      const p2 = makePhoto();
      await repo.save(p1);
      await repo.save(p2);

      const album = makeAlbumValues();
      testDb.insert(schema.albums).values(album).run();

      await repo.addToAlbum(p1.id, album.id);
      await repo.addToAlbum(p2.id, album.id);

      // Reverse the order: p2 first, then p1
      await repo.updatePhotoSortOrders(album.id, [p2.id, p1.id]);

      const results = await repo.findByAlbumId(album.id);
      expect(results[0].id).toBe(p2.id);
      expect(results[1].id).toBe(p1.id);
    });

    it("findBySlugPrefix() finds photo by ID prefix", async () => {
      const photo = makePhoto({ id: "abcdef12-3456-7890-abcd-ef1234567890" });
      await repo.save(photo);

      const result = await repo.findBySlugPrefix("abcdef12");
      expect(result).not.toBeNull();
      expect(result!.id).toBe(photo.id);
    });

    it("findBySlugPrefix() returns null for non-matching prefix", async () => {
      const photo = makePhoto();
      await repo.save(photo);

      const result = await repo.findBySlugPrefix("zzzzz");
      expect(result).toBeNull();
    });
  });

  // ---- findRandomFromPublishedAlbums ----

  describe("findRandomFromPublishedAlbums", () => {
    it("returns only photos from published albums with status ready", async () => {
      const readyPhoto = makePhoto({ status: "ready" });
      const processingPhoto = makePhoto({ status: "processing" });
      await repo.save(readyPhoto);
      await repo.save(processingPhoto);

      const publishedAlbum = makeAlbumValues({ isPublished: true });
      const unpublishedAlbum = makeAlbumValues({ isPublished: false });
      testDb.insert(schema.albums).values(publishedAlbum).run();
      testDb.insert(schema.albums).values(unpublishedAlbum).run();

      // readyPhoto in published album
      await repo.addToAlbum(readyPhoto.id, publishedAlbum.id);
      // processingPhoto in published album (should be excluded by status)
      await repo.addToAlbum(processingPhoto.id, publishedAlbum.id);

      // Create another ready photo only in unpublished album
      const unpublishedPhoto = makePhoto({ status: "ready" });
      await repo.save(unpublishedPhoto);
      await repo.addToAlbum(unpublishedPhoto.id, unpublishedAlbum.id);

      const results = await repo.findRandomFromPublishedAlbums(10);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(readyPhoto.id);
    });

    it("respects the limit parameter", async () => {
      const album = makeAlbumValues({ isPublished: true });
      testDb.insert(schema.albums).values(album).run();

      // Add 5 ready photos to published album
      for (let i = 0; i < 5; i++) {
        const photo = makePhoto({ status: "ready" });
        await repo.save(photo);
        await repo.addToAlbum(photo.id, album.id);
      }

      const results = await repo.findRandomFromPublishedAlbums(2);
      expect(results).toHaveLength(2);
    });
  });

  // ---- Serialization edge cases (UNIT-02) ----

  describe("Serialization edge cases", () => {
    it("ExifData round-trip preserves full object", async () => {
      const exifData: ExifData = {
        cameraMake: "Canon",
        cameraModel: "EOS R5",
        lens: "RF 24-70mm F2.8L",
        focalLength: 50,
        aperture: 2.8,
        shutterSpeed: "1/250",
        iso: 400,
        dateTaken: "2024-06-15T10:30:00Z",
        whiteBalance: "Auto",
        meteringMode: "Matrix",
        flash: "Did not fire",
      };

      const photo = makePhoto({ exifData });
      await repo.save(photo);

      const result = await repo.findById(photo.id);
      expect(result).not.toBeNull();
      expect(result!.exifData).toEqual(exifData);
    });

    it("null ExifData round-trips as null", async () => {
      const photo = makePhoto({ exifData: null });
      await repo.save(photo);

      const result = await repo.findById(photo.id);
      expect(result).not.toBeNull();
      expect(result!.exifData).toBeNull();
    });

    it("corrupt ExifData JSON is handled gracefully (returns null)", async () => {
      const photo = makePhoto();
      await repo.save(photo);

      // Inject corrupt JSON via raw SQL
      testSqlite
        .prepare("UPDATE photos SET exif_data = ? WHERE id = ?")
        .run("{invalid json}", photo.id);

      // Suppress the expected console.error from safeParseExifJson
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await repo.findById(photo.id);
      expect(result).not.toBeNull();
      expect(result!.exifData).toBeNull();

      consoleSpy.mockRestore();
    });

    it("Unicode filename round-trips correctly", async () => {
      const photo = makePhoto({
        originalFilename: "foto_\u00e9t\u00e9_\u2603.jpg",
      });
      await repo.save(photo);

      const result = await repo.findById(photo.id);
      expect(result).not.toBeNull();
      expect(result!.originalFilename).toBe("foto_\u00e9t\u00e9_\u2603.jpg");
    });

    it("zero dimensions survive round-trip as 0 (not null)", async () => {
      const photo = makePhoto({ width: 0, height: 0 });
      await repo.save(photo);

      const result = await repo.findById(photo.id);
      expect(result).not.toBeNull();
      // The toDomain uses ?? operator which preserves 0
      expect(result!.width).toBe(0);
      expect(result!.height).toBe(0);
    });

    it("timestamp precision is preserved via getTime()", async () => {
      const knownDate = new Date("2024-06-15T14:30:45.123Z");
      const photo = makePhoto({
        createdAt: knownDate,
        updatedAt: knownDate,
      });
      await repo.save(photo);

      const result = await repo.findById(photo.id);
      expect(result).not.toBeNull();
      expect(result!.createdAt.getTime()).toBe(knownDate.getTime());
    });

    it("all Photo status values round-trip correctly", async () => {
      const statuses: Array<"processing" | "ready" | "error"> = [
        "processing",
        "ready",
        "error",
      ];

      for (const status of statuses) {
        const photo = makePhoto({ status });
        await repo.save(photo);

        const result = await repo.findById(photo.id);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(status);
      }
    });

    it("null title and description round-trip as null", async () => {
      const photo = makePhoto({ title: null, description: null });
      await repo.save(photo);

      const result = await repo.findById(photo.id);
      expect(result).not.toBeNull();
      expect(result!.title).toBeNull();
      expect(result!.description).toBeNull();
    });

    it("blurDataUrl round-trips correctly", async () => {
      const blurData = "data:image/png;base64,iVBORw0KGgo=";
      const photo = makePhoto({ blurDataUrl: blurData });
      await repo.save(photo);

      const result = await repo.findById(photo.id);
      expect(result).not.toBeNull();
      expect(result!.blurDataUrl).toBe(blurData);
    });
  });
});
