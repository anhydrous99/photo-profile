/// <reference types="vitest/globals" />
/**
 * Integration tests for DynamoDBAlbumRepository.
 *
 * Tests full CRUD lifecycle, GSI queries, denormalized counts, sort order
 * operations, cascade deletes, batch operations, and toDomain/toDatabase
 * round-trip serialization against DynamoDB Local.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTables, deleteTables, TABLE_NAMES } from "../tables";
import { docClient } from "../client";
import {
  ScanCommand,
  DeleteCommand,
  PutCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Album } from "@/domain/entities/Album";
import type { Photo } from "@/domain/entities/Photo";
import { DynamoDBAlbumRepository } from "../repositories/DynamoDBAlbumRepository";
import { DynamoDBPhotoRepository } from "../repositories/DynamoDBPhotoRepository";

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

/** Insert a photo directly into DynamoDB for test setup */
async function insertPhoto(photo: Photo): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.PHOTOS,
      Item: {
        id: photo.id,
        title: photo.title,
        description: photo.description,
        originalFilename: photo.originalFilename,
        blurDataUrl: photo.blurDataUrl,
        exifData: photo.exifData,
        width: photo.width,
        height: photo.height,
        status: photo.status,
        createdAt: photo.createdAt.getTime(),
        updatedAt: photo.updatedAt.getTime(),
        _type: "PHOTO",
      },
    }),
  );
}

/** Insert an AlbumPhotos junction entry directly */
async function insertAlbumPhoto(
  albumId: string,
  photoId: string,
  sortOrder: number,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.ALBUM_PHOTOS,
      Item: { albumId, photoId, sortOrder },
    }),
  );
}

/** Clean all items from all tables between tests */
async function cleanAllTables(): Promise<void> {
  // Clean Photos
  const photosResult = await docClient.send(
    new ScanCommand({ TableName: TABLE_NAMES.PHOTOS }),
  );
  for (const item of photosResult.Items ?? []) {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.PHOTOS,
        Key: { id: item.id },
      }),
    );
  }

  // Clean Albums
  const albumsResult = await docClient.send(
    new ScanCommand({ TableName: TABLE_NAMES.ALBUMS }),
  );
  for (const item of albumsResult.Items ?? []) {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.ALBUMS,
        Key: { id: item.id },
      }),
    );
  }

  // Clean AlbumPhotos
  const albumPhotosResult = await docClient.send(
    new ScanCommand({ TableName: TABLE_NAMES.ALBUM_PHOTOS }),
  );
  for (const item of albumPhotosResult.Items ?? []) {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.ALBUM_PHOTOS,
        Key: { albumId: item.albumId, photoId: item.photoId },
      }),
    );
  }
}

// ---- Test Suite ----

describe("DynamoDBAlbumRepository", () => {
  let repo: DynamoDBAlbumRepository;
  let photoRepo: DynamoDBPhotoRepository;

  beforeAll(async () => {
    await deleteTables();
    await createTables();
  }, 30000);

  afterAll(async () => {
    await deleteTables();
  }, 30000);

  beforeEach(async () => {
    albumCounter = 0;
    photoCounter = 0;
    await cleanAllTables();
    photoRepo = new DynamoDBPhotoRepository();
    repo = new DynamoDBAlbumRepository(photoRepo);
  }, 15000);

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
      const a1 = makeAlbum({ sortOrder: 0 });
      const a2 = makeAlbum({ sortOrder: 1 });
      const a3 = makeAlbum({ sortOrder: 2 });
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

    it("delete() cascades to AlbumPhotos entries", async () => {
      const album = makeAlbum();
      await repo.save(album);

      const photo = makePhoto();
      await insertPhoto(photo);
      await insertAlbumPhoto(album.id, photo.id, 0);

      await repo.delete(album.id);

      // AlbumPhotos entry should be removed
      const albumPhotos = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAMES.ALBUM_PHOTOS,
          FilterExpression: "albumId = :albumId",
          ExpressionAttributeValues: { ":albumId": album.id },
        }),
      );
      expect(albumPhotos.Items ?? []).toHaveLength(0);

      // Photo record should still exist
      const photoResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAMES.PHOTOS,
          Key: { id: photo.id },
        }),
      );
      expect(photoResult.Item).toBeDefined();
    });
  });

  // ---- Query methods ----

  describe("Query methods", () => {
    it("findPublished() returns only albums with isPublished: true", async () => {
      const published1 = makeAlbum({ isPublished: true, sortOrder: 0 });
      const published2 = makeAlbum({ isPublished: true, sortOrder: 1 });
      const unpublished = makeAlbum({ isPublished: false, sortOrder: 2 });
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

    it("findPublished() returns results sorted by sortOrder ascending", async () => {
      const a1 = makeAlbum({ isPublished: true, sortOrder: 2 });
      const a2 = makeAlbum({ isPublished: true, sortOrder: 0 });
      const a3 = makeAlbum({ isPublished: true, sortOrder: 1 });
      await repo.save(a1);
      await repo.save(a2);
      await repo.save(a3);

      const results = await repo.findPublished();
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(a2.id); // sortOrder 0
      expect(results[1].id).toBe(a3.id); // sortOrder 1
      expect(results[2].id).toBe(a1.id); // sortOrder 2
    });

    it("findAll() returns results sorted by sortOrder ascending", async () => {
      const a1 = makeAlbum({ sortOrder: 2 });
      const a2 = makeAlbum({ sortOrder: 0 });
      const a3 = makeAlbum({ sortOrder: 1 });
      await repo.save(a1);
      await repo.save(a2);
      await repo.save(a3);

      const results = await repo.findAll();
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(a2.id); // sortOrder 0
      expect(results[1].id).toBe(a3.id); // sortOrder 1
      expect(results[2].id).toBe(a1.id); // sortOrder 2
    });

    it("getPhotoCounts() returns correct count per album using denormalized photoCount", async () => {
      const album1 = makeAlbum({ sortOrder: 0 });
      const album2 = makeAlbum({ sortOrder: 1 });
      await repo.save(album1);
      await repo.save(album2);

      // Insert photos and junction entries, update denormalized counts
      const p1 = makePhoto();
      const p2 = makePhoto();
      const p3 = makePhoto();
      await insertPhoto(p1);
      await insertPhoto(p2);
      await insertPhoto(p3);

      // Use photoRepo.addToAlbum to correctly maintain denormalized counts
      await photoRepo.addToAlbum(p1.id, album1.id);
      await photoRepo.addToAlbum(p2.id, album1.id);
      await photoRepo.addToAlbum(p3.id, album2.id);

      const counts = await repo.getPhotoCounts();
      expect(counts.get(album1.id)).toBe(2);
      expect(counts.get(album2.id)).toBe(1);
    });

    it("getPhotoCounts() returns empty Map when no albums exist", async () => {
      const counts = await repo.getPhotoCounts();
      expect(counts.size).toBe(0);
    });

    it("getPhotoCounts() returns 0 for album with no photos", async () => {
      const album = makeAlbum();
      await repo.save(album);

      const counts = await repo.getPhotoCounts();
      // Album exists with default photoCount=0
      expect(counts.get(album.id)).toBe(0);
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

    it("updateSortOrders() handles batch > 25 albums", async () => {
      const albums: Album[] = [];
      for (let i = 0; i < 30; i++) {
        const album = makeAlbum({ sortOrder: i });
        await repo.save(album);
        albums.push(album);
      }

      // Reverse the order
      const reversedIds = albums.map((a) => a.id).reverse();
      await repo.updateSortOrders(reversedIds);

      // Check first and last
      const first = await repo.findById(reversedIds[0]);
      const last = await repo.findById(reversedIds[29]);
      expect(first!.sortOrder).toBe(0);
      expect(last!.sortOrder).toBe(29);

      // Verify all albums appear in findAll (sorted)
      const all = await repo.findAll();
      expect(all).toHaveLength(30);
      expect(all[0].id).toBe(reversedIds[0]);
      expect(all[29].id).toBe(reversedIds[29]);
    });
  });

  // ---- deleteWithPhotos ----

  describe("deleteWithPhotos", () => {
    it("deleteWithPhotos(id, false) deletes album and AlbumPhotos entries, returns empty deletedPhotoIds", async () => {
      const album = makeAlbum();
      await repo.save(album);

      const photo = makePhoto();
      await insertPhoto(photo);
      await insertAlbumPhoto(album.id, photo.id, 0);

      const result = await repo.deleteWithPhotos(album.id, false);
      expect(result.deletedPhotoIds).toHaveLength(0);

      // Album should be deleted
      expect(await repo.findById(album.id)).toBeNull();

      // AlbumPhotos entry should be removed
      const albumPhotos = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAMES.ALBUM_PHOTOS,
          FilterExpression: "albumId = :albumId",
          ExpressionAttributeValues: { ":albumId": album.id },
        }),
      );
      expect(albumPhotos.Items ?? []).toHaveLength(0);

      // Photo record should still exist
      const photoResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAMES.PHOTOS,
          Key: { id: photo.id },
        }),
      );
      expect(photoResult.Item).toBeDefined();
    });

    it("deleteWithPhotos(id, true) deletes album, AlbumPhotos, and photos via PhotoRepository", async () => {
      const album = makeAlbum();
      await repo.save(album);

      const p1 = makePhoto();
      const p2 = makePhoto();
      await insertPhoto(p1);
      await insertPhoto(p2);
      await insertAlbumPhoto(album.id, p1.id, 0);
      await insertAlbumPhoto(album.id, p2.id, 1);

      const result = await repo.deleteWithPhotos(album.id, true);

      // Should return the photo IDs
      expect(result.deletedPhotoIds).toHaveLength(2);
      expect(result.deletedPhotoIds).toContain(p1.id);
      expect(result.deletedPhotoIds).toContain(p2.id);

      // Album should be deleted
      expect(await repo.findById(album.id)).toBeNull();

      // AlbumPhotos entries should be removed
      const albumPhotos = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAMES.ALBUM_PHOTOS,
          FilterExpression: "albumId = :albumId",
          ExpressionAttributeValues: { ":albumId": album.id },
        }),
      );
      expect(albumPhotos.Items ?? []).toHaveLength(0);

      // Photo records should be deleted (via PhotoRepository.delete cascade)
      const photo1Result = await docClient.send(
        new GetCommand({ TableName: TABLE_NAMES.PHOTOS, Key: { id: p1.id } }),
      );
      expect(photo1Result.Item).toBeUndefined();

      const photo2Result = await docClient.send(
        new GetCommand({ TableName: TABLE_NAMES.PHOTOS, Key: { id: p2.id } }),
      );
      expect(photo2Result.Item).toBeUndefined();
    });

    it("deleteWithPhotos() for empty album returns empty array", async () => {
      const album = makeAlbum();
      await repo.save(album);

      const result = await repo.deleteWithPhotos(album.id, true);
      expect(result.deletedPhotoIds).toHaveLength(0);
      expect(await repo.findById(album.id)).toBeNull();
    });

    it("deleteWithPhotos(id, false) with multiple photos preserves all photos", async () => {
      const album = makeAlbum();
      await repo.save(album);

      const photos: Photo[] = [];
      for (let i = 0; i < 5; i++) {
        const p = makePhoto();
        await insertPhoto(p);
        await insertAlbumPhoto(album.id, p.id, i);
        photos.push(p);
      }

      const result = await repo.deleteWithPhotos(album.id, false);
      expect(result.deletedPhotoIds).toHaveLength(0);

      // All photos should still exist
      for (const p of photos) {
        const r = await docClient.send(
          new GetCommand({ TableName: TABLE_NAMES.PHOTOS, Key: { id: p.id } }),
        );
        expect(r.Item).toBeDefined();
      }
    });
  });

  // ---- Serialization edge cases ----

  describe("Serialization edge cases", () => {
    it("isPublished boolean round-trips correctly", async () => {
      const album = makeAlbum({ isPublished: true, sortOrder: 0 });
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

    it("coverPhotoId with valid value round-trips correctly", async () => {
      const photo = makePhoto();
      await insertPhoto(photo);

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

    it("description with special characters round-trips correctly", async () => {
      const album = makeAlbum({
        description: "Photos d'été — «magnifique» ☀️",
      });
      await repo.save(album);

      const result = await repo.findById(album.id);
      expect(result).not.toBeNull();
      expect(result!.description).toBe("Photos d'été — «magnifique» ☀️");
    });
  });
});
