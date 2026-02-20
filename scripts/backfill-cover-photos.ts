/**
 * One-time migration script: backfill coverPhotoId on all Albums
 *
 * Usage: npx tsx scripts/backfill-cover-photos.ts
 *
 * For each album with coverPhotoId === null, queries its photos and sets
 * the first "ready" photo (by sort order) as the cover.
 * Safe to run multiple times (idempotent — skips albums that already have a cover).
 */
import {
  ScanCommand,
  QueryCommand,
  UpdateCommand,
  BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient } from "../src/infrastructure/database/dynamodb/client";
import { TABLE_NAMES } from "../src/infrastructure/database/dynamodb/tables";

async function backfillCoverPhotos(): Promise<void> {
  let totalScanned = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined = undefined;

  console.log("Starting coverPhotoId backfill for Albums table...");
  console.log(`Table: ${TABLE_NAMES.ALBUMS}`);

  do {
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAMES.ALBUMS,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    );

    const items = scanResult.Items ?? [];
    totalScanned += items.length;

    console.log(
      `Scanned ${items.length} albums (total so far: ${totalScanned})`,
    );

    for (const item of items) {
      const albumId = item.id as string;
      if (!albumId) {
        console.warn("  Skipping item with no id:", JSON.stringify(item));
        continue;
      }

      // Skip albums that already have a cover
      if (item.coverPhotoId) {
        totalSkipped++;
        console.log(`  Skipped album=${albumId} (already has cover)`);
        continue;
      }

      try {
        // Query album photos sorted by sortOrder
        const albumPhotosResult = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAMES.ALBUM_PHOTOS,
            KeyConditionExpression: "albumId = :albumId",
            ExpressionAttributeValues: { ":albumId": albumId },
          }),
        );

        const albumPhotoItems = albumPhotosResult.Items ?? [];
        if (albumPhotoItems.length === 0) {
          totalSkipped++;
          console.log(`  Skipped album=${albumId} (no photos)`);
          continue;
        }

        // Sort by sortOrder
        albumPhotoItems.sort(
          (a, b) => (a.sortOrder as number) - (b.sortOrder as number),
        );

        const photoIds = albumPhotoItems.map((ap) => ap.photoId as string);

        // Batch-get the photos to check status
        const keys = photoIds.map((id) => ({ id }));
        const batchResult = await docClient.send(
          new BatchGetCommand({
            RequestItems: {
              [TABLE_NAMES.PHOTOS]: { Keys: keys },
            },
          }),
        );

        const photoItems = batchResult.Responses?.[TABLE_NAMES.PHOTOS] ?? [];
        const photoMap = new Map<string, Record<string, unknown>>();
        for (const p of photoItems) {
          photoMap.set(p.id as string, p);
        }

        // Find first "ready" photo in sort order
        let coverPhotoId: string | null = null;
        for (const pid of photoIds) {
          const photo = photoMap.get(pid);
          if (photo && photo.status === "ready") {
            coverPhotoId = pid;
            break;
          }
        }

        if (!coverPhotoId) {
          totalSkipped++;
          console.log(`  Skipped album=${albumId} (no ready photos)`);
          continue;
        }

        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAMES.ALBUMS,
            Key: { id: albumId },
            UpdateExpression: "SET coverPhotoId = :coverPhotoId",
            ExpressionAttributeValues: { ":coverPhotoId": coverPhotoId },
          }),
        );
        totalUpdated++;
        console.log(
          `  Updated album=${albumId} → coverPhotoId=${coverPhotoId}`,
        );
      } catch (err) {
        totalErrors++;
        console.error(
          `  ERROR updating album=${albumId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    exclusiveStartKey = scanResult.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey !== undefined);

  console.log("\n--- Backfill complete ---");
  console.log(`Total scanned : ${totalScanned}`);
  console.log(`Total updated : ${totalUpdated}`);
  console.log(`Total skipped : ${totalSkipped}`);
  console.log(`Total errors  : ${totalErrors}`);

  if (totalErrors > 0) {
    console.error(
      `\n${totalErrors} album(s) failed to update. Check logs above.`,
    );
    process.exit(1);
  }
}

backfillCoverPhotos().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
