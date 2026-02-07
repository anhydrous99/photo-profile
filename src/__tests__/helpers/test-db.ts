/**
 * In-memory test database factory.
 *
 * Creates a fresh SQLite :memory: database with the full production schema
 * by replaying the exact migration chain from client.ts initializeDatabase().
 *
 * Usage:
 *   const { db, sqlite } = createTestDb();
 *   // ... use db for Drizzle queries ...
 *   sqlite.close(); // cleanup
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/infrastructure/database/schema";

export function createTestDb() {
  const sqlite = new Database(":memory:");

  // Replay the exact migration chain from client.ts initializeDatabase()

  // 1. Create photos table (base columns)
  sqlite.exec(`
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
  `);

  // 2. Create albums table (base, without tags, with NO ACTION FK — matches initial schema)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      cover_photo_id TEXT REFERENCES photos(id),
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  // 3. Create photo_albums junction table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS photo_albums (
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (photo_id, album_id)
    )
  `);

  // 4. Create indexes
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS photo_albums_photo_idx ON photo_albums(photo_id)`,
  );
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS photo_albums_album_idx ON photo_albums(album_id)`,
  );

  // 5. Migration: Add exif_data column (Phase 11)
  sqlite.exec(`ALTER TABLE photos ADD COLUMN exif_data TEXT`);

  // 6. Migration: Add width/height columns (Phase 12)
  sqlite.exec(`ALTER TABLE photos ADD COLUMN width INTEGER`);
  sqlite.exec(`ALTER TABLE photos ADD COLUMN height INTEGER`);

  // 7. Migration: Fix coverPhotoId FK constraint + add tags column (Phase 13)
  //    Rebuild albums table with ON DELETE SET NULL and tags TEXT column
  sqlite.pragma("foreign_keys = OFF");
  sqlite.exec(`
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
    INSERT INTO albums SELECT id, title, description, NULL, cover_photo_id, sort_order, is_published, created_at FROM _albums_old;
    DROP TABLE _albums_old;
  `);

  // 8. Rebuild photo_albums to fix stale FK reference to _albums_old
  //    (SQLite does not update FK references in other tables when
  //     foreign_keys is OFF during ALTER TABLE RENAME)
  sqlite.exec(`
    DROP INDEX IF EXISTS photo_albums_photo_idx;
    DROP INDEX IF EXISTS photo_albums_album_idx;
    ALTER TABLE photo_albums RENAME TO _photo_albums_old;
    CREATE TABLE photo_albums (
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (photo_id, album_id)
    );
    INSERT INTO photo_albums SELECT photo_id, album_id, sort_order FROM _photo_albums_old;
    DROP TABLE _photo_albums_old;
    CREATE INDEX photo_albums_photo_idx ON photo_albums(photo_id);
    CREATE INDEX photo_albums_album_idx ON photo_albums(album_id);
  `);

  // 9. Enable foreign key enforcement
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle({ client: sqlite, schema });

  return { db, sqlite };
}
