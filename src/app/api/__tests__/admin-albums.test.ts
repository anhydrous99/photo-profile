/// <reference types="vitest/globals" />
/**
 * Integration tests for admin album API routes.
 *
 * Tests authentication checks, Zod validation, and CRUD responses
 * for GET/POST /api/admin/albums and PATCH/DELETE /api/admin/albums/[id]
 * endpoints.
 *
 * Uses real SQLite in-memory database with mocked auth and storage.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/infrastructure/database/schema";

let testDb: BetterSQLite3Database<typeof schema>;
let testSqlite: Database.Database;

// ---- Mocks (must be before route imports) ----

vi.mock("@/infrastructure/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/auth")>();
  return { ...actual, verifySession: vi.fn() };
});

vi.mock("@/infrastructure/database/client", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/infrastructure/storage", () => ({
  deletePhotoFiles: vi.fn().mockResolvedValue(undefined),
  saveOriginalFile: vi.fn().mockResolvedValue("/tmp/test/original.jpg"),
}));

vi.mock("@/infrastructure/jobs", () => ({
  enqueueImageProcessing: vi.fn().mockResolvedValue("mock-job-id"),
}));

// ---- Imports (after mocks) ----

import { verifySession } from "@/infrastructure/auth";
import { GET, POST } from "@/app/api/admin/albums/route";
import { PATCH, DELETE } from "@/app/api/admin/albums/[id]/route";
import { NextRequest } from "next/server";
import { createTestDb } from "@/__tests__/helpers/test-db";
import type { Album } from "@/domain/entities/Album";

// ---- Helpers ----

function makeJsonRequest(
  url: string,
  method: string,
  body?: unknown,
): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }
      : {}),
  });
}

let albumCounter = 0;
let photoCounter = 0;

function makeAlbum(overrides: Partial<Album> = {}): Album {
  albumCounter++;
  return {
    id: crypto.randomUUID(),
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

function insertAlbum(album: Album) {
  testDb
    .insert(schema.albums)
    .values({
      id: album.id,
      title: album.title,
      description: album.description,
      tags: album.tags,
      coverPhotoId: album.coverPhotoId,
      sortOrder: album.sortOrder,
      isPublished: album.isPublished,
      createdAt: album.createdAt,
    })
    .run();
}

function insertPhoto(id?: string) {
  photoCounter++;
  const photoId = id ?? crypto.randomUUID();
  testDb
    .insert(schema.photos)
    .values({
      id: photoId,
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
    })
    .run();
  return photoId;
}

// ---- Test Suite ----

describe("Admin Album API Routes", () => {
  beforeEach(() => {
    albumCounter = 0;
    photoCounter = 0;
    const { db, sqlite } = createTestDb();
    testDb = db;
    testSqlite = sqlite;
    vi.mocked(verifySession).mockResolvedValue({ isAuth: true });
  });

  afterEach(() => {
    testSqlite.close();
    vi.restoreAllMocks();
  });

  // ---- GET /api/admin/albums ----

  describe("GET /api/admin/albums", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(verifySession).mockResolvedValue(null);

      const res = await GET();

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 200 with empty array when no albums exist", async () => {
      const res = await GET();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("returns 200 with albums including photoCount field", async () => {
      const album1 = makeAlbum({ sortOrder: 1 });
      const album2 = makeAlbum({ sortOrder: 2 });
      insertAlbum(album1);
      insertAlbum(album2);

      // Insert photos and junction entries
      const photoId1 = insertPhoto();
      const photoId2 = insertPhoto();
      const photoId3 = insertPhoto();

      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: photoId1, albumId: album1.id, sortOrder: 0 })
        .run();
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: photoId2, albumId: album1.id, sortOrder: 1 })
        .run();
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: photoId3, albumId: album2.id, sortOrder: 0 })
        .run();

      const res = await GET();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);

      // Sorted by sortOrder: album1 first (sortOrder 1), album2 second (sortOrder 2)
      expect(body[0].id).toBe(album1.id);
      expect(body[0].photoCount).toBe(2);
      expect(body[1].id).toBe(album2.id);
      expect(body[1].photoCount).toBe(1);
    });
  });

  // ---- POST /api/admin/albums ----

  describe("POST /api/admin/albums", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(verifySession).mockResolvedValue(null);

      const req = makeJsonRequest("http://localhost/api/admin/albums", "POST", {
        title: "New Album",
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 400 for invalid body (empty title) with { error: 'Validation failed' }", async () => {
      const req = makeJsonRequest("http://localhost/api/admin/albums", "POST", {
        title: "",
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
    });

    it("returns 400 for missing title", async () => {
      const req = makeJsonRequest(
        "http://localhost/api/admin/albums",
        "POST",
        {},
      );
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
    });

    it("returns 201 with created album for valid input", async () => {
      const req = makeJsonRequest("http://localhost/api/admin/albums", "POST", {
        title: "New Album",
      });
      const res = await POST(req);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.title).toBe("New Album");
      expect(body.id).toBeDefined();
      expect(body.sortOrder).toBe(1);
      expect(body.isPublished).toBe(false);
    });

    it("returns 201 and assigns incrementing sortOrder", async () => {
      // Create first album
      const req1 = makeJsonRequest(
        "http://localhost/api/admin/albums",
        "POST",
        { title: "First Album" },
      );
      const res1 = await POST(req1);
      expect(res1.status).toBe(201);
      const body1 = await res1.json();
      expect(body1.sortOrder).toBe(1);

      // Create second album
      const req2 = makeJsonRequest(
        "http://localhost/api/admin/albums",
        "POST",
        { title: "Second Album" },
      );
      const res2 = await POST(req2);
      expect(res2.status).toBe(201);
      const body2 = await res2.json();
      expect(body2.sortOrder).toBe(2);
    });
  });

  // ---- PATCH /api/admin/albums/[id] ----

  describe("PATCH /api/admin/albums/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(verifySession).mockResolvedValue(null);

      const req = makeJsonRequest(
        "http://localhost/api/admin/albums/some-id",
        "PATCH",
        { title: "Updated" },
      );
      const res = await PATCH(req, {
        params: Promise.resolve({ id: "some-id" }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 404 for non-existent album ID", async () => {
      const req = makeJsonRequest(
        "http://localhost/api/admin/albums/non-existent",
        "PATCH",
        { title: "Updated" },
      );
      const res = await PATCH(req, {
        params: Promise.resolve({ id: "non-existent" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Album not found");
    });

    it("returns 400 for invalid body (title too long)", async () => {
      const album = makeAlbum();
      insertAlbum(album);

      const longTitle = "a".repeat(101);
      const req = makeJsonRequest(
        `http://localhost/api/admin/albums/${album.id}`,
        "PATCH",
        { title: longTitle },
      );
      const res = await PATCH(req, {
        params: Promise.resolve({ id: album.id }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
    });

    it("returns 200 with updated album for valid partial update", async () => {
      const album = makeAlbum({
        title: "Original Title",
        description: "Original description",
      });
      insertAlbum(album);

      const req = makeJsonRequest(
        `http://localhost/api/admin/albums/${album.id}`,
        "PATCH",
        { title: "Updated Title" },
      );
      const res = await PATCH(req, {
        params: Promise.resolve({ id: album.id }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe("Updated Title");
      expect(body.description).toBe("Original description");
    });
  });

  // ---- DELETE /api/admin/albums/[id] ----

  describe("DELETE /api/admin/albums/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(verifySession).mockResolvedValue(null);

      const req = makeJsonRequest(
        "http://localhost/api/admin/albums/some-id",
        "DELETE",
      );
      const res = await DELETE(req, {
        params: Promise.resolve({ id: "some-id" }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 404 for non-existent album ID", async () => {
      const req = makeJsonRequest(
        "http://localhost/api/admin/albums/non-existent",
        "DELETE",
      );
      const res = await DELETE(req, {
        params: Promise.resolve({ id: "non-existent" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Album not found");
    });

    it("returns 204 on successful delete (album-only, no photo deletion)", async () => {
      const album = makeAlbum();
      insertAlbum(album);

      const req = makeJsonRequest(
        `http://localhost/api/admin/albums/${album.id}`,
        "DELETE",
        { deletePhotos: false },
      );
      const res = await DELETE(req, {
        params: Promise.resolve({ id: album.id }),
      });

      expect(res.status).toBe(204);
    });

    it("returns 204 when deleting with photos", async () => {
      const album = makeAlbum();
      insertAlbum(album);

      // Insert photos and associate them with album
      const photoId1 = insertPhoto();
      const photoId2 = insertPhoto();

      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: photoId1, albumId: album.id, sortOrder: 0 })
        .run();
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: photoId2, albumId: album.id, sortOrder: 1 })
        .run();

      const req = makeJsonRequest(
        `http://localhost/api/admin/albums/${album.id}`,
        "DELETE",
        { deletePhotos: true },
      );
      const res = await DELETE(req, {
        params: Promise.resolve({ id: album.id }),
      });

      expect(res.status).toBe(204);
    });
  });
});
