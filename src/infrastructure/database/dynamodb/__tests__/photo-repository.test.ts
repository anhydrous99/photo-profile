/// <reference types="vitest/globals" />
/**
 * Integration tests for DynamoDBPhotoRepository.
 *
 * Tests full CRUD lifecycle, cursor pagination, junction table operations,
 * cascade deletes, batch operations, and toDomain/toDatabase round-trip
 * serialization against DynamoDB Local.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTables, deleteTables, TABLE_NAMES } from "../tables";
import { docClient } from "../client";
import { ScanCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { Photo, ExifData } from "@/domain/entities/Photo";
import {
  DynamoDBPhotoRepository,
  calculateAlbumWeight,
} from "../repositories/DynamoDBPhotoRepository";

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

interface AlbumValues {
  id: string;
  title: string;
  description: string | null;
  tags: string | null;
  coverPhotoId: string | null;
  sortOrder: number;
  isPublished: number;
  photoCount: number;
  firstReadyPhotoId: string | null;
  createdAt: number;
  updatedAt: number;
  _type: string;
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
): AlbumValues {
  albumCounter++;
  const createdAt = overrides.createdAt ?? new Date("2024-01-01T00:00:00Z");
  return {
    id: overrides.id ?? `test-album-${albumCounter}`,
    title: overrides.title ?? `Test Album ${albumCounter}`,
    description: overrides.description ?? null,
    tags: overrides.tags ?? null,
    coverPhotoId: overrides.coverPhotoId ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    isPublished: (overrides.isPublished ?? false) ? 1 : 0,
    photoCount: 0,
    firstReadyPhotoId: null,
    createdAt: createdAt.getTime(),
    updatedAt: createdAt.getTime(),
    _type: "ALBUM",
  };
}

/** Insert an album directly into DynamoDB for test setup */
async function insertAlbum(album: AlbumValues): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.ALBUMS,
      Item: album,
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

describe("DynamoDBPhotoRepository", () => {
  let repo: DynamoDBPhotoRepository;

  beforeAll(async () => {
    await deleteTables();
    await createTables();
  }, 30000);

  afterAll(async () => {
    await deleteTables();
  }, 30000);

  beforeEach(async () => {
    photoCounter = 0;
    albumCounter = 0;
    await cleanAllTables();
    repo = new DynamoDBPhotoRepository();
  }, 15000);

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

    it("delete() cascades to AlbumPhotos and updates Album counts", async () => {
      const photo = makePhoto({ status: "ready" });
      await repo.save(photo);

      const album = makeAlbumValues({ isPublished: true });
      await insertAlbum(album);

      await repo.addToAlbum(photo.id, album.id);

      // Verify album has photo count
      const albumsBefore = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAMES.ALBUMS,
          FilterExpression: "id = :id",
          ExpressionAttributeValues: { ":id": album.id },
        }),
      );
      expect(albumsBefore.Items?.[0]?.photoCount).toBe(1);

      // Delete photo - should cascade
      await repo.delete(photo.id);

      // Verify AlbumPhotos entry is removed
      const albumPhotos = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAMES.ALBUM_PHOTOS,
          FilterExpression: "photoId = :photoId",
          ExpressionAttributeValues: { ":photoId": photo.id },
        }),
      );
      expect(albumPhotos.Items ?? []).toHaveLength(0);

      // Verify album photo count is decremented
      const albumsAfter = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAMES.ALBUMS,
          FilterExpression: "id = :id",
          ExpressionAttributeValues: { ":id": album.id },
        }),
      );
      expect(albumsAfter.Items?.[0]?.photoCount).toBe(0);
    });

    it("delete() cascades across multiple albums", async () => {
      const photo = makePhoto({ status: "ready" });
      await repo.save(photo);

      const album1 = makeAlbumValues({ isPublished: true });
      const album2 = makeAlbumValues({ isPublished: false });
      await insertAlbum(album1);
      await insertAlbum(album2);

      await repo.addToAlbum(photo.id, album1.id);
      await repo.addToAlbum(photo.id, album2.id);

      await repo.delete(photo.id);

      // Both AlbumPhotos entries should be gone
      const albumPhotos = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAMES.ALBUM_PHOTOS,
          FilterExpression: "photoId = :photoId",
          ExpressionAttributeValues: { ":photoId": photo.id },
        }),
      );
      expect(albumPhotos.Items ?? []).toHaveLength(0);
    });
  });

  // ---- Junction table operations ----

  describe("Junction table operations", () => {
    it("addToAlbum() + getAlbumIds() links photo to album", async () => {
      const photo = makePhoto();
      await repo.save(photo);
      const album = makeAlbumValues();
      await insertAlbum(album);

      await repo.addToAlbum(photo.id, album.id);
      const albumIds = await repo.getAlbumIds(photo.id);
      expect(albumIds).toContain(album.id);
      expect(albumIds).toHaveLength(1);
    });

    it("addToAlbum() twice to same album is idempotent", async () => {
      const photo = makePhoto();
      await repo.save(photo);
      const album = makeAlbumValues();
      await insertAlbum(album);

      await repo.addToAlbum(photo.id, album.id);
      await repo.addToAlbum(photo.id, album.id);

      const albumIds = await repo.getAlbumIds(photo.id);
      expect(albumIds).toHaveLength(1);
    });

    it("removeFromAlbum() removes the association", async () => {
      const photo = makePhoto();
      await repo.save(photo);
      const album = makeAlbumValues();
      await insertAlbum(album);

      await repo.addToAlbum(photo.id, album.id);
      expect(await repo.getAlbumIds(photo.id)).toHaveLength(1);

      await repo.removeFromAlbum(photo.id, album.id);
      expect(await repo.getAlbumIds(photo.id)).toHaveLength(0);
    });

    it("removeFromAlbum() decrements album photoCount", async () => {
      const photo = makePhoto();
      await repo.save(photo);
      const album = makeAlbumValues();
      await insertAlbum(album);

      await repo.addToAlbum(photo.id, album.id);

      // Verify photo count incremented
      let albumData = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAMES.ALBUMS,
          FilterExpression: "id = :id",
          ExpressionAttributeValues: { ":id": album.id },
        }),
      );
      expect(albumData.Items?.[0]?.photoCount).toBe(1);

      await repo.removeFromAlbum(photo.id, album.id);

      albumData = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAMES.ALBUMS,
          FilterExpression: "id = :id",
          ExpressionAttributeValues: { ":id": album.id },
        }),
      );
      expect(albumData.Items?.[0]?.photoCount).toBe(0);
    });

    it("findByAlbumId() returns photos ordered by sortOrder", async () => {
      const p1 = makePhoto();
      const p2 = makePhoto();
      const p3 = makePhoto();
      await repo.save(p1);
      await repo.save(p2);
      await repo.save(p3);

      const album = makeAlbumValues();
      await insertAlbum(album);

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

    it("findByAlbumId() returns empty array for album with no photos", async () => {
      const album = makeAlbumValues();
      await insertAlbum(album);

      const results = await repo.findByAlbumId(album.id);
      expect(results).toHaveLength(0);
    });

    it("updatePhotoSortOrders() reorders photos within an album", async () => {
      const p1 = makePhoto();
      const p2 = makePhoto();
      await repo.save(p1);
      await repo.save(p2);

      const album = makeAlbumValues();
      await insertAlbum(album);

      await repo.addToAlbum(p1.id, album.id);
      await repo.addToAlbum(p2.id, album.id);

      // Reverse the order: p2 first, then p1
      await repo.updatePhotoSortOrders(album.id, [p2.id, p1.id]);

      const results = await repo.findByAlbumId(album.id);
      expect(results[0].id).toBe(p2.id);
      expect(results[1].id).toBe(p1.id);
    });

    it("updatePhotoSortOrders() handles batch > 25 items", async () => {
      const album = makeAlbumValues();
      await insertAlbum(album);

      const photos: Photo[] = [];
      for (let i = 0; i < 30; i++) {
        const p = makePhoto({
          createdAt: new Date(
            `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
          ),
        });
        await repo.save(p);
        await repo.addToAlbum(p.id, album.id);
        photos.push(p);
      }

      // Reverse the order
      const reversedIds = photos.map((p) => p.id).reverse();
      await repo.updatePhotoSortOrders(album.id, reversedIds);

      const results = await repo.findByAlbumId(album.id);
      expect(results).toHaveLength(30);
      expect(results[0].id).toBe(reversedIds[0]);
      expect(results[29].id).toBe(reversedIds[29]);
    });

    it("getAlbumIds() returns multiple albums", async () => {
      const photo = makePhoto();
      await repo.save(photo);

      const album1 = makeAlbumValues();
      const album2 = makeAlbumValues();
      const album3 = makeAlbumValues();
      await insertAlbum(album1);
      await insertAlbum(album2);
      await insertAlbum(album3);

      await repo.addToAlbum(photo.id, album1.id);
      await repo.addToAlbum(photo.id, album2.id);
      await repo.addToAlbum(photo.id, album3.id);

      const albumIds = await repo.getAlbumIds(photo.id);
      expect(albumIds).toHaveLength(3);
      expect(albumIds).toContain(album1.id);
      expect(albumIds).toContain(album2.id);
      expect(albumIds).toContain(album3.id);
    });

    it("getAlbumIds() returns empty array for photo not in any album", async () => {
      const photo = makePhoto();
      await repo.save(photo);

      const albumIds = await repo.getAlbumIds(photo.id);
      expect(albumIds).toHaveLength(0);
    });
  });

  // ---- findBySlugPrefix ----

  describe("findBySlugPrefix", () => {
    it("finds photo by ID prefix", async () => {
      const photo = makePhoto({ id: "abcdef12-3456-7890-abcd-ef1234567890" });
      await repo.save(photo);

      const result = await repo.findBySlugPrefix("abcdef12");
      expect(result).not.toBeNull();
      expect(result!.id).toBe(photo.id);
    });

    it("returns null for non-matching prefix", async () => {
      const photo = makePhoto();
      await repo.save(photo);

      const result = await repo.findBySlugPrefix("zzzzz");
      expect(result).toBeNull();
    });
  });

  // ---- findByStatus ----

  describe("findByStatus", () => {
    it("returns only photos with matching status", async () => {
      const ready = makePhoto({ status: "ready" });
      const processing = makePhoto({ status: "processing" });
      const error = makePhoto({ status: "error" });
      await repo.save(ready);
      await repo.save(processing);
      await repo.save(error);

      const results = await repo.findByStatus("ready");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(ready.id);
    });

    it("returns empty array when no photos match status", async () => {
      const photo = makePhoto({ status: "ready" });
      await repo.save(photo);

      const results = await repo.findByStatus("error");
      expect(results).toHaveLength(0);
    });
  });

  // ---- findStaleProcessing ----

  describe("findStaleProcessing", () => {
    it("returns processing photos older than threshold", async () => {
      const oldProcessing = makePhoto({
        status: "processing",
        createdAt: new Date(Date.now() - 60000), // 60s ago
      });
      const newProcessing = makePhoto({
        status: "processing",
        createdAt: new Date(), // now
      });
      const readyOld = makePhoto({
        status: "ready",
        createdAt: new Date(Date.now() - 60000),
      });
      await repo.save(oldProcessing);
      await repo.save(newProcessing);
      await repo.save(readyOld);

      // Threshold: 30 seconds
      const results = await repo.findStaleProcessing(30000);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(oldProcessing.id);
    });

    it("returns empty array when no stale processing photos", async () => {
      const photo = makePhoto({
        status: "processing",
        createdAt: new Date(), // just created
      });
      await repo.save(photo);

      const results = await repo.findStaleProcessing(30000);
      expect(results).toHaveLength(0);
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
      await insertAlbum(publishedAlbum);
      await insertAlbum(unpublishedAlbum);

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
      await insertAlbum(album);

      // Add 5 ready photos to published album
      for (let i = 0; i < 5; i++) {
        const photo = makePhoto({ status: "ready" });
        await repo.save(photo);
        await repo.addToAlbum(photo.id, album.id);
      }

      const results = await repo.findRandomFromPublishedAlbums(2);
      expect(results).toHaveLength(2);
    });

    it("returns empty array when no published albums exist", async () => {
      const results = await repo.findRandomFromPublishedAlbums(10);
      expect(results).toHaveLength(0);
    });

    it("deduplicates photos in multiple published albums", async () => {
      const photo = makePhoto({ status: "ready" });
      await repo.save(photo);

      const album1 = makeAlbumValues({ isPublished: true, sortOrder: 0 });
      const album2 = makeAlbumValues({ isPublished: true, sortOrder: 1 });
      await insertAlbum(album1);
      await insertAlbum(album2);

      // Same photo in both albums
      await repo.addToAlbum(photo.id, album1.id);
      await repo.addToAlbum(photo.id, album2.id);

      const results = await repo.findRandomFromPublishedAlbums(10);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(photo.id);
    });

    describe("weighted mode", () => {
      it("returns photos when weighted option is true", async () => {
        const album0 = makeAlbumValues({
          isPublished: true,
          sortOrder: 0,
        });
        const album1 = makeAlbumValues({
          isPublished: true,
          sortOrder: 1,
        });
        const album2 = makeAlbumValues({
          isPublished: true,
          sortOrder: 2,
        });
        await insertAlbum(album0);
        await insertAlbum(album1);
        await insertAlbum(album2);

        const photo0 = makePhoto({ status: "ready" });
        const photo1 = makePhoto({ status: "ready" });
        const photo2 = makePhoto({ status: "ready" });
        await repo.save(photo0);
        await repo.save(photo1);
        await repo.save(photo2);

        await repo.addToAlbum(photo0.id, album0.id);
        await repo.addToAlbum(photo1.id, album1.id);
        await repo.addToAlbum(photo2.id, album2.id);

        const results = await repo.findRandomFromPublishedAlbums(10, {
          weighted: true,
        });
        expect(results).toHaveLength(3);

        const resultIds = results.map((p) => p.id).sort();
        const expectedIds = [photo0.id, photo1.id, photo2.id].sort();
        expect(resultIds).toEqual(expectedIds);
      });

      it("handles single published album without error", async () => {
        const album = makeAlbumValues({ isPublished: true });
        await insertAlbum(album);

        const photos = [
          makePhoto({ status: "ready" }),
          makePhoto({ status: "ready" }),
          makePhoto({ status: "ready" }),
        ];
        for (const photo of photos) {
          await repo.save(photo);
          await repo.addToAlbum(photo.id, album.id);
        }

        const results = await repo.findRandomFromPublishedAlbums(10, {
          weighted: true,
        });
        expect(results).toHaveLength(3);
      });

      it("deduplicates photos across multiple albums in weighted mode", async () => {
        const photo = makePhoto({ status: "ready" });
        await repo.save(photo);

        const album1 = makeAlbumValues({
          isPublished: true,
          sortOrder: 0,
        });
        const album2 = makeAlbumValues({
          isPublished: true,
          sortOrder: 1,
        });
        await insertAlbum(album1);
        await insertAlbum(album2);

        await repo.addToAlbum(photo.id, album1.id);
        await repo.addToAlbum(photo.id, album2.id);

        const results = await repo.findRandomFromPublishedAlbums(10, {
          weighted: true,
        });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(photo.id);
      });

      it("uses uniform shuffle when options is undefined (backward compatibility)", async () => {
        const album = makeAlbumValues({ isPublished: true });
        await insertAlbum(album);

        const photos = [
          makePhoto({ status: "ready" }),
          makePhoto({ status: "ready" }),
          makePhoto({ status: "ready" }),
        ];
        for (const photo of photos) {
          await repo.save(photo);
          await repo.addToAlbum(photo.id, album.id);
        }

        const results = await repo.findRandomFromPublishedAlbums(3);
        expect(results).toHaveLength(3);
      });
    });
  });

  // ---- calculateAlbumWeight ----

  describe("calculateAlbumWeight", () => {
    it("produces correct weights for album rankings", () => {
      expect(calculateAlbumWeight(0, 4)).toBe(3.0);
      expect(calculateAlbumWeight(4, 4)).toBe(1.0);
      expect(calculateAlbumWeight(2, 4)).toBe(2.0);
      expect(calculateAlbumWeight(0, 0)).toBe(3.0);
    });
  });

  // ---- Serialization edge cases ----

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

  // ---- findPaginated ----

  describe("findPaginated", () => {
    it("returns correct page of results with limit", async () => {
      const p1 = makePhoto({
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
      });
      const p2 = makePhoto({
        createdAt: new Date("2024-01-02T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      });
      const p3 = makePhoto({
        createdAt: new Date("2024-01-03T00:00:00Z"),
        updatedAt: new Date("2024-01-03T00:00:00Z"),
      });
      await repo.save(p1);
      await repo.save(p2);
      await repo.save(p3);

      const result = await repo.findPaginated({ limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).not.toBeNull();
    });

    it("returns nextCursor when more items exist", async () => {
      for (let i = 1; i <= 4; i++) {
        const p = makePhoto({
          createdAt: new Date(`2024-01-0${i}T00:00:00Z`),
          updatedAt: new Date(`2024-01-0${i}T00:00:00Z`),
        });
        await repo.save(p);
      }

      const result = await repo.findPaginated({ limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).not.toBeNull();
    });

    it("results are ordered by createdAt descending (newest first)", async () => {
      const p1 = makePhoto({
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
      });
      const p2 = makePhoto({
        createdAt: new Date("2024-01-02T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      });
      const p3 = makePhoto({
        createdAt: new Date("2024-01-03T00:00:00Z"),
        updatedAt: new Date("2024-01-03T00:00:00Z"),
      });
      await repo.save(p1);
      await repo.save(p2);
      await repo.save(p3);

      const result = await repo.findPaginated({ limit: 10 });
      expect(result.data).toHaveLength(3);
      expect(result.data[0].id).toBe(p3.id);
      expect(result.data[1].id).toBe(p2.id);
      expect(result.data[2].id).toBe(p1.id);
    });

    it("status filter returns only photos with matching status", async () => {
      const ready1 = makePhoto({
        status: "ready",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      });
      const processing = makePhoto({
        status: "processing",
        createdAt: new Date("2024-01-02T00:00:00Z"),
      });
      const ready2 = makePhoto({
        status: "ready",
        createdAt: new Date("2024-01-03T00:00:00Z"),
      });
      await repo.save(ready1);
      await repo.save(processing);
      await repo.save(ready2);

      const result = await repo.findPaginated({
        limit: 10,
        status: "ready",
      });
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
      expect(result.data[0].status).toBe("ready");
      expect(result.data[1].status).toBe("ready");
    });

    it("returns empty data and null nextCursor when no photos exist", async () => {
      const result = await repo.findPaginated({ limit: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it("cursor-based pagination returns next page correctly", async () => {
      const p1 = makePhoto({
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
      });
      const p2 = makePhoto({
        createdAt: new Date("2024-01-02T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      });
      const p3 = makePhoto({
        createdAt: new Date("2024-01-03T00:00:00Z"),
        updatedAt: new Date("2024-01-03T00:00:00Z"),
      });
      await repo.save(p1);
      await repo.save(p2);
      await repo.save(p3);

      const page1 = await repo.findPaginated({ limit: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await repo.findPaginated({
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.data).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
      expect(page2.data[0].id).toBe(p1.id);
    });

    it("cursor-based pagination has no overlap between pages", async () => {
      const photos: Photo[] = [];
      for (let i = 1; i <= 5; i++) {
        const p = makePhoto({
          createdAt: new Date(`2024-01-0${i}T00:00:00Z`),
          updatedAt: new Date(`2024-01-0${i}T00:00:00Z`),
        });
        await repo.save(p);
        photos.push(p);
      }

      const page1 = await repo.findPaginated({ limit: 2 });
      const page2 = await repo.findPaginated({
        limit: 2,
        cursor: page1.nextCursor!,
      });
      const page3 = await repo.findPaginated({
        limit: 2,
        cursor: page2.nextCursor!,
      });

      const allIds = [
        ...page1.data.map((p) => p.id),
        ...page2.data.map((p) => p.id),
        ...page3.data.map((p) => p.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(5);
      expect(allIds).toHaveLength(5);
    });

    it("status filter with no matching photos returns empty data", async () => {
      const ready = makePhoto({
        status: "ready",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      });
      await repo.save(ready);

      const result = await repo.findPaginated({
        limit: 10,
        status: "processing",
      });
      expect(result.data).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it("albumFilter 'none' returns only photos not in any album", async () => {
      const assigned = makePhoto({
        createdAt: new Date("2024-01-01T00:00:00Z"),
      });
      const unassigned = makePhoto({
        createdAt: new Date("2024-01-02T00:00:00Z"),
      });
      await repo.save(assigned);
      await repo.save(unassigned);

      const album = makeAlbumValues();
      await insertAlbum(album);
      await repo.addToAlbum(assigned.id, album.id);

      const result = await repo.findPaginated({
        limit: 10,
        albumFilter: "none",
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(unassigned.id);
    });

    it("albumFilter 'none' combined with status filter", async () => {
      const readyOrphan = makePhoto({
        status: "ready",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      });
      const processingOrphan = makePhoto({
        status: "processing",
        createdAt: new Date("2024-01-02T00:00:00Z"),
      });
      const readyAssigned = makePhoto({
        status: "ready",
        createdAt: new Date("2024-01-03T00:00:00Z"),
      });
      await repo.save(readyOrphan);
      await repo.save(processingOrphan);
      await repo.save(readyAssigned);

      const album = makeAlbumValues();
      await insertAlbum(album);
      await repo.addToAlbum(readyAssigned.id, album.id);

      const result = await repo.findPaginated({
        limit: 10,
        status: "ready",
        albumFilter: "none",
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(readyOrphan.id);
    });

    it("omitting albumFilter returns all photos", async () => {
      const assigned = makePhoto({
        createdAt: new Date("2024-01-01T00:00:00Z"),
      });
      const unassigned = makePhoto({
        createdAt: new Date("2024-01-02T00:00:00Z"),
      });
      await repo.save(assigned);
      await repo.save(unassigned);

      const album = makeAlbumValues();
      await insertAlbum(album);
      await repo.addToAlbum(assigned.id, album.id);

      const result = await repo.findPaginated({
        limit: 10,
      });
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });
  });
});
