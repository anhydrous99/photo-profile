/// <reference types="vitest/globals" />
/**
 * Integration tests for admin photo API routes.
 *
 * Tests authentication checks, Zod validation, and CRUD responses
 * for PATCH/DELETE /api/admin/photos/[id] and GET/POST/DELETE
 * /api/admin/photos/[id]/albums endpoints.
 *
 * Uses real SQLite in-memory database with mocked auth, storage, and jobs.
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
import { PATCH, DELETE } from "@/app/api/admin/photos/[id]/route";
import {
  GET as AlbumGET,
  POST as AlbumPOST,
  DELETE as AlbumDELETE,
} from "@/app/api/admin/photos/[id]/albums/route";
import { NextRequest } from "next/server";
import { createTestDb } from "@/__tests__/helpers/test-db";
import type { Photo } from "@/domain/entities/Photo";
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

async function insertPhoto(photo: Photo) {
  testDb
    .insert(schema.photos)
    .values({
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
    })
    .run();
}

async function insertAlbum(album: Album) {
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

// ---- Test Suite ----

describe("Admin Photo API Routes", () => {
  beforeEach(() => {
    photoCounter = 0;
    albumCounter = 0;
    const { db, sqlite } = createTestDb();
    testDb = db;
    testSqlite = sqlite;
    vi.mocked(verifySession).mockResolvedValue({ isAuth: true });
  });

  afterEach(() => {
    testSqlite.close();
    vi.restoreAllMocks();
  });

  // ---- PATCH /api/admin/photos/[id] ----

  describe("PATCH /api/admin/photos/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(verifySession).mockResolvedValue(null);

      const req = makeJsonRequest(
        "http://localhost/api/admin/photos/some-id",
        "PATCH",
        { description: "test" },
      );
      const res = await PATCH(req, {
        params: Promise.resolve({ id: "some-id" }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 404 for non-existent photo ID", async () => {
      const req = makeJsonRequest(
        "http://localhost/api/admin/photos/non-existent",
        "PATCH",
        { description: "test" },
      );
      const res = await PATCH(req, {
        params: Promise.resolve({ id: "non-existent" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Photo not found");
    });

    it("returns 400 for invalid body with { error: 'Validation failed' }", async () => {
      const photo = makePhoto();
      await insertPhoto(photo);

      const req = makeJsonRequest(
        `http://localhost/api/admin/photos/${photo.id}`,
        "PATCH",
        { invalid: "field" },
      );
      const res = await PATCH(req, {
        params: Promise.resolve({ id: photo.id }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
    });

    it("returns 200 with updated photo for valid request", async () => {
      const photo = makePhoto({ description: "Original desc" });
      await insertPhoto(photo);

      const req = makeJsonRequest(
        `http://localhost/api/admin/photos/${photo.id}`,
        "PATCH",
        { description: "Updated desc" },
      );
      const res = await PATCH(req, {
        params: Promise.resolve({ id: photo.id }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.description).toBe("Updated desc");
      expect(body.id).toBe(photo.id);
    });
  });

  // ---- DELETE /api/admin/photos/[id] ----

  describe("DELETE /api/admin/photos/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(verifySession).mockResolvedValue(null);

      const req = makeJsonRequest(
        "http://localhost/api/admin/photos/some-id",
        "DELETE",
      );
      const res = await DELETE(req, {
        params: Promise.resolve({ id: "some-id" }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 404 for non-existent photo ID", async () => {
      const req = makeJsonRequest(
        "http://localhost/api/admin/photos/non-existent",
        "DELETE",
      );
      const res = await DELETE(req, {
        params: Promise.resolve({ id: "non-existent" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Photo not found");
    });

    it("returns 204 on successful delete", async () => {
      const photo = makePhoto();
      await insertPhoto(photo);

      const req = makeJsonRequest(
        `http://localhost/api/admin/photos/${photo.id}`,
        "DELETE",
      );
      const res = await DELETE(req, {
        params: Promise.resolve({ id: photo.id }),
      });

      expect(res.status).toBe(204);
    });
  });

  // ---- GET /api/admin/photos/[id]/albums ----

  describe("GET /api/admin/photos/[id]/albums", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(verifySession).mockResolvedValue(null);

      const req = makeJsonRequest(
        "http://localhost/api/admin/photos/some-id/albums",
        "GET",
      );
      const res = await AlbumGET(req, {
        params: Promise.resolve({ id: "some-id" }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 200 with albumIds array", async () => {
      const photo = makePhoto();
      await insertPhoto(photo);
      const album = makeAlbum();
      await insertAlbum(album);

      // Add photo to album via junction table
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: photo.id, albumId: album.id, sortOrder: 0 })
        .run();

      const req = makeJsonRequest(
        `http://localhost/api/admin/photos/${photo.id}/albums`,
        "GET",
      );
      const res = await AlbumGET(req, {
        params: Promise.resolve({ id: photo.id }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.albumIds).toEqual([album.id]);
    });
  });

  // ---- POST /api/admin/photos/[id]/albums ----

  describe("POST /api/admin/photos/[id]/albums", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(verifySession).mockResolvedValue(null);

      const req = makeJsonRequest(
        "http://localhost/api/admin/photos/some-id/albums",
        "POST",
        { albumId: "some-album" },
      );
      const res = await AlbumPOST(req, {
        params: Promise.resolve({ id: "some-id" }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 400 for invalid body (missing albumId) with { error: 'Validation failed' }", async () => {
      const photo = makePhoto();
      await insertPhoto(photo);

      const req = makeJsonRequest(
        `http://localhost/api/admin/photos/${photo.id}/albums`,
        "POST",
        { invalid: "field" },
      );
      const res = await AlbumPOST(req, {
        params: Promise.resolve({ id: photo.id }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
    });

    it("returns 404 for non-existent photo ID", async () => {
      const req = makeJsonRequest(
        "http://localhost/api/admin/photos/non-existent/albums",
        "POST",
        { albumId: "some-album" },
      );
      const res = await AlbumPOST(req, {
        params: Promise.resolve({ id: "non-existent" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Photo not found");
    });

    it("returns 201 on success", async () => {
      const photo = makePhoto();
      await insertPhoto(photo);
      const album = makeAlbum();
      await insertAlbum(album);

      const req = makeJsonRequest(
        `http://localhost/api/admin/photos/${photo.id}/albums`,
        "POST",
        { albumId: album.id },
      );
      const res = await AlbumPOST(req, {
        params: Promise.resolve({ id: photo.id }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ---- DELETE /api/admin/photos/[id]/albums ----

  describe("DELETE /api/admin/photos/[id]/albums", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(verifySession).mockResolvedValue(null);

      const req = makeJsonRequest(
        "http://localhost/api/admin/photos/some-id/albums",
        "DELETE",
        { albumId: "some-album" },
      );
      const res = await AlbumDELETE(req, {
        params: Promise.resolve({ id: "some-id" }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 204 on successful removal", async () => {
      const photo = makePhoto();
      await insertPhoto(photo);
      const album = makeAlbum();
      await insertAlbum(album);

      // Add photo to album first
      testDb
        .insert(schema.photoAlbums)
        .values({ photoId: photo.id, albumId: album.id, sortOrder: 0 })
        .run();

      const req = makeJsonRequest(
        `http://localhost/api/admin/photos/${photo.id}/albums`,
        "DELETE",
        { albumId: album.id },
      );
      const res = await AlbumDELETE(req, {
        params: Promise.resolve({ id: photo.id }),
      });

      expect(res.status).toBe(204);
    });
  });
});
