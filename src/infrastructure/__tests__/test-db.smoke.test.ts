/**
 * Smoke tests for in-memory test database helper.
 *
 * Validates that createTestDb() produces a database with:
 * - Correct photos schema (all columns including migrations)
 * - Correct albums schema (including tags and FK constraint)
 * - Working Drizzle ORM queries (insert, select, relationships)
 * - Correct cascade delete behavior
 *
 * These tests also serve as usage examples for Phase 17 test authors.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/__tests__/helpers/test-db";
import { photos, albums, photoAlbums } from "@/infrastructure/database/schema";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/infrastructure/database/schema";

describe("Test database smoke tests", () => {
  let db: BetterSQLite3Database<typeof schema>;
  let sqlite: Database.Database;

  afterEach(() => {
    sqlite.close();
  });

  it("creates in-memory database with correct photos schema", () => {
    ({ db, sqlite } = createTestDb());
    const columns = sqlite.pragma("table_info(photos)") as Array<{
      name: string;
    }>;
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("title");
    expect(columnNames).toContain("description");
    expect(columnNames).toContain("original_filename");
    expect(columnNames).toContain("blur_data_url");
    expect(columnNames).toContain("status");
    expect(columnNames).toContain("created_at");
    expect(columnNames).toContain("updated_at");
    expect(columnNames).toContain("exif_data");
    expect(columnNames).toContain("width");
    expect(columnNames).toContain("height");
    expect(columns).toHaveLength(11);
  });

  it("creates in-memory database with correct albums schema including tags", () => {
    ({ db, sqlite } = createTestDb());
    const columns = sqlite.pragma("table_info(albums)") as Array<{
      name: string;
    }>;
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("title");
    expect(columnNames).toContain("description");
    expect(columnNames).toContain("tags");
    expect(columnNames).toContain("cover_photo_id");
    expect(columnNames).toContain("sort_order");
    expect(columnNames).toContain("is_published");
    expect(columnNames).toContain("created_at");
    expect(columns).toHaveLength(8);
  });

  it("albums cover_photo_id FK has ON DELETE SET NULL", () => {
    ({ db, sqlite } = createTestDb());
    const fks = sqlite.pragma("foreign_key_list(albums)") as Array<{
      from: string;
      on_delete: string;
    }>;
    const coverFk = fks.find((fk) => fk.from === "cover_photo_id");

    expect(coverFk).toBeDefined();
    expect(coverFk!.on_delete).toBe("SET NULL");
  });

  it("can insert and query photos via Drizzle ORM", () => {
    ({ db, sqlite } = createTestDb());
    const photoId = "test-photo-001";

    db.insert(photos)
      .values({
        id: photoId,
        originalFilename: "test.jpg",
        status: "ready",
      })
      .run();

    const results = db.select().from(photos).all();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(photoId);
    expect(results[0].originalFilename).toBe("test.jpg");
    expect(results[0].status).toBe("ready");
  });

  it("can insert album and link to photo via junction table", () => {
    ({ db, sqlite } = createTestDb());
    const photoId = "test-photo-002";
    const albumId = "test-album-001";

    db.insert(photos)
      .values({ id: photoId, originalFilename: "photo.jpg", status: "ready" })
      .run();

    db.insert(albums).values({ id: albumId, title: "Test Album" }).run();

    db.insert(photoAlbums).values({ photoId, albumId, sortOrder: 0 }).run();

    const junctions = db.select().from(photoAlbums).all();
    expect(junctions).toHaveLength(1);
    expect(junctions[0].photoId).toBe(photoId);
    expect(junctions[0].albumId).toBe(albumId);
  });

  it("cascade deletes work on photo_albums", () => {
    ({ db, sqlite } = createTestDb());
    const photoId = "test-photo-003";
    const albumId = "test-album-002";

    db.insert(photos)
      .values({ id: photoId, originalFilename: "cascade.jpg", status: "ready" })
      .run();

    db.insert(albums).values({ id: albumId, title: "Cascade Album" }).run();

    db.insert(photoAlbums).values({ photoId, albumId, sortOrder: 0 }).run();

    // Delete the photo -- junction row should cascade
    db.delete(photos).where(eq(photos.id, photoId)).run();

    const junctions = db.select().from(photoAlbums).all();
    expect(junctions).toHaveLength(0);
  });
});
