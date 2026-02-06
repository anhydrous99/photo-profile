import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  title: text("title"),
  description: text("description"),
  originalFilename: text("original_filename").notNull(),
  blurDataUrl: text("blur_data_url"),
  exifData: text("exif_data"), // JSON-serialized ExifData
  status: text("status", { enum: ["processing", "ready", "error"] })
    .notNull()
    .default("processing"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const albums = sqliteTable("albums", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  tags: text("tags"), // comma-separated, e.g. "landscape,nature,2024"
  coverPhotoId: text("cover_photo_id").references(() => photos.id, {
    onDelete: "set null",
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: integer("is_published", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const photoAlbums = sqliteTable(
  "photo_albums",
  {
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.photoId, table.albumId] }),
    index("photo_albums_photo_idx").on(table.photoId),
    index("photo_albums_album_idx").on(table.albumId),
  ],
);
