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
  } catch (error) {
    console.error("Failed to initialize database schema:", error);
    throw new Error("Database initialization failed");
  }
}

// Initialize database on module load
initializeDatabase();
