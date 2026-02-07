import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import path from "path";
import * as schema from "./schema";
import { env } from "@/infrastructure/config/env";

const dbPath = path.resolve(process.cwd(), env.DATABASE_PATH);
const sqlite = new Database(dbPath);
export const db = drizzle({ client: sqlite, schema });

/**
 * Initialize database schema if it doesn't exist.
 * Creates tables for photos, albums, and photo_albums.
 * Safe to call multiple times - uses "CREATE TABLE IF NOT EXISTS"
 */
export function initializeDatabase() {
  try {
    // Create photos table
    db.run(
      sql`
        CREATE TABLE IF NOT EXISTS photos (
          id TEXT PRIMARY KEY,
          title TEXT,
          description TEXT,
          original_filename TEXT NOT NULL,
          blur_data_url TEXT,
          status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'ready', 'error')),
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        )
      `,
    );

    // Create albums table
    db.run(
      sql`
        CREATE TABLE IF NOT EXISTS albums (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          cover_photo_id TEXT REFERENCES photos(id),
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_published INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        )
      `,
    );

    // Create photo_albums junction table
    db.run(
      sql`
        CREATE TABLE IF NOT EXISTS photo_albums (
          photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
          album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (photo_id, album_id)
        )
      `,
    );

    // Create indexes
    db.run(
      sql`
        CREATE INDEX IF NOT EXISTS photo_albums_photo_idx ON photo_albums(photo_id)
      `,
    );

    db.run(
      sql`
        CREATE INDEX IF NOT EXISTS photo_albums_album_idx ON photo_albums(album_id)
      `,
    );

    // Migration: Add exif_data column (Phase 11)
    const tableInfo = sqlite
      .prepare("PRAGMA table_info(photos)")
      .all() as Array<{ name: string }>;
    const hasExifData = tableInfo.some((col) => col.name === "exif_data");
    if (!hasExifData) {
      sqlite.prepare("ALTER TABLE photos ADD COLUMN exif_data TEXT").run();
      console.log("[DB] Added exif_data column to photos table");
    }

    // Migration: Add width/height columns (Phase 12)
    const tableInfoForDims = sqlite
      .prepare("PRAGMA table_info(photos)")
      .all() as Array<{ name: string }>;
    const hasWidth = tableInfoForDims.some((col) => col.name === "width");
    if (!hasWidth) {
      sqlite.prepare("ALTER TABLE photos ADD COLUMN width INTEGER").run();
      sqlite.prepare("ALTER TABLE photos ADD COLUMN height INTEGER").run();
      console.log("[DB] Added width and height columns to photos table");
    }

    // Migration: Fix coverPhotoId FK constraint to ON DELETE SET NULL (Phase 13)
    const fkInfo = sqlite
      .prepare("PRAGMA foreign_key_list(albums)")
      .all() as Array<{
      table: string;
      from: string;
      on_delete: string;
    }>;
    const coverFk = fkInfo.find((fk) => fk.from === "cover_photo_id");
    if (coverFk && coverFk.on_delete !== "SET NULL") {
      sqlite.pragma("foreign_keys = OFF");
      sqlite.exec(`
        BEGIN TRANSACTION;
        ALTER TABLE albums RENAME TO _albums_old;
        CREATE TABLE albums (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          tags TEXT,
          cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_published INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );
        INSERT INTO albums SELECT id, title, description, tags, cover_photo_id, sort_order, is_published, created_at FROM _albums_old;
        DROP TABLE _albums_old;
        COMMIT;
      `);
      sqlite.pragma("foreign_keys = ON");
      console.log(
        "[DB] Fixed coverPhotoId FK constraint to ON DELETE SET NULL",
      );
    }

    // Enable foreign key enforcement
    sqlite.pragma("foreign_keys = ON");
    console.log("[DB] Foreign key enforcement enabled");
  } catch (error) {
    console.error("Failed to initialize database schema:", error);
    throw new Error("Database initialization failed");
  }
}

// Initialize database on module load
initializeDatabase();
