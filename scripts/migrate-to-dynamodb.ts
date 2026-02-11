/**
 * Migrate data from SQLite to DynamoDB
 *
 * Usage:
 *   npm run db:migrate-dynamo             # Live migration
 *   npm run db:migrate-dynamo -- --dry-run  # Dry run (no writes)
 *
 * Migration order: Photos → Albums → AlbumPhotos (respects dependencies)
 *
 * Idempotent: Uses PutItem (upsert) — safe to run multiple times.
 * Non-destructive: SQLite data is never modified or deleted.
 */
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/database/client";
import { photos, albums, photoAlbums } from "@/infrastructure/database/schema";
import { docClient } from "@/infrastructure/database/dynamodb/client";
import { TABLE_NAMES } from "@/infrastructure/database/dynamodb/tables";
import { BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const BATCH_SIZE = 25;
const isDryRun = process.argv.includes("--dry-run");

async function migratePhotos(): Promise<number> {
  const allPhotos = await db.select().from(photos);
  console.log(`Found ${allPhotos.length} photos to migrate`);

  if (isDryRun || allPhotos.length === 0) return allPhotos.length;

  for (let i = 0; i < allPhotos.length; i += BATCH_SIZE) {
    const batch = allPhotos.slice(i, i + BATCH_SIZE);
    const putRequests = batch.map((photo) => ({
      PutRequest: {
        Item: {
          id: photo.id,
          title: photo.title,
          description: photo.description,
          originalFilename: photo.originalFilename,
          blurDataUrl: photo.blurDataUrl,
          exifData: photo.exifData ? JSON.parse(photo.exifData) : null,
          width: photo.width,
          height: photo.height,
          status: photo.status,
          createdAt: photo.createdAt.getTime(),
          updatedAt: photo.updatedAt.getTime(),
          _type: "PHOTO",
        },
      },
    }));

    await docClient.send(
      new BatchWriteCommand({
        RequestItems: { [TABLE_NAMES.PHOTOS]: putRequests },
      }),
    );

    console.log(
      `  Migrated photos: ${Math.min(i + BATCH_SIZE, allPhotos.length)}/${allPhotos.length}`,
    );
  }

  return allPhotos.length;
}

async function migrateAlbums(): Promise<number> {
  const allAlbums = await db.select().from(albums);
  console.log(`Found ${allAlbums.length} albums to migrate`);

  if (isDryRun || allAlbums.length === 0) return allAlbums.length;

  for (const album of allAlbums) {
    const albumPhotoRows = await db
      .select()
      .from(photoAlbums)
      .where(eq(photoAlbums.albumId, album.id));

    const photoIds = albumPhotoRows.map((ap) => ap.photoId);

    let firstReadyPhotoId: string | null = null;
    if (photoIds.length > 0) {
      const readyPhotos = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(inArray(photos.id, photoIds), eq(photos.status, "ready")));

      if (readyPhotos.length > 0) {
        firstReadyPhotoId = readyPhotos[0].id;
      }
    }

    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAMES.ALBUMS]: [
            {
              PutRequest: {
                Item: {
                  id: album.id,
                  title: album.title,
                  description: album.description,
                  tags: album.tags,
                  coverPhotoId: album.coverPhotoId,
                  sortOrder: album.sortOrder,
                  isPublished: album.isPublished ? 1 : 0,
                  createdAt: album.createdAt.getTime(),
                  photoCount: albumPhotoRows.length,
                  firstReadyPhotoId,
                  _type: "ALBUM",
                },
              },
            },
          ],
        },
      }),
    );
  }

  console.log(`  Migrated ${allAlbums.length} albums`);
  return allAlbums.length;
}

async function migrateAlbumPhotos(): Promise<number> {
  const allAlbumPhotos = await db.select().from(photoAlbums);
  console.log(
    `Found ${allAlbumPhotos.length} album-photo relationships to migrate`,
  );

  if (isDryRun || allAlbumPhotos.length === 0) return allAlbumPhotos.length;

  for (let i = 0; i < allAlbumPhotos.length; i += BATCH_SIZE) {
    const batch = allAlbumPhotos.slice(i, i + BATCH_SIZE);
    const putRequests = batch.map((ap) => ({
      PutRequest: {
        Item: {
          albumId: ap.albumId,
          photoId: ap.photoId,
          sortOrder: ap.sortOrder,
        },
      },
    }));

    await docClient.send(
      new BatchWriteCommand({
        RequestItems: { [TABLE_NAMES.ALBUM_PHOTOS]: putRequests },
      }),
    );

    console.log(
      `  Migrated album-photos: ${Math.min(i + BATCH_SIZE, allAlbumPhotos.length)}/${allAlbumPhotos.length}`,
    );
  }

  return allAlbumPhotos.length;
}

async function verify(
  sqlitePhotos: number,
  sqliteAlbums: number,
  sqliteAlbumPhotos: number,
): Promise<boolean> {
  console.log("\nVerification:");
  console.log(
    `  SQLite: ${sqlitePhotos} photos, ${sqliteAlbums} albums, ${sqliteAlbumPhotos} album-photos`,
  );

  if (isDryRun) {
    console.log("  (Dry run — no data written, skipping DynamoDB count)");
    return true;
  }

  const [dynamoPhotos, dynamoAlbums, dynamoAlbumPhotos] = await Promise.all([
    docClient.send(
      new ScanCommand({ TableName: TABLE_NAMES.PHOTOS, Select: "COUNT" }),
    ),
    docClient.send(
      new ScanCommand({ TableName: TABLE_NAMES.ALBUMS, Select: "COUNT" }),
    ),
    docClient.send(
      new ScanCommand({ TableName: TABLE_NAMES.ALBUM_PHOTOS, Select: "COUNT" }),
    ),
  ]);

  console.log(
    `  DynamoDB: ${dynamoPhotos.Count} photos, ${dynamoAlbums.Count} albums, ${dynamoAlbumPhotos.Count} album-photos`,
  );

  const match =
    dynamoPhotos.Count === sqlitePhotos &&
    dynamoAlbums.Count === sqliteAlbums &&
    dynamoAlbumPhotos.Count === sqliteAlbumPhotos;

  if (match) {
    console.log("\n✓ Migration complete! All counts match.");
  } else {
    console.error("\n✗ Count mismatch! Migration may be incomplete.");
  }

  return match;
}

async function main() {
  console.log(
    `Starting SQLite → DynamoDB migration (${isDryRun ? "DRY RUN" : "LIVE"})...\n`,
  );

  const photoCount = await migratePhotos();
  const albumCount = await migrateAlbums();
  const albumPhotoCount = await migrateAlbumPhotos();

  const ok = await verify(photoCount, albumCount, albumPhotoCount);
  if (!ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
