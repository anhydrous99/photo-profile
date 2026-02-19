/**
 * One-time migration script: backfill slug attribute on all Photos
 *
 * Usage: npx tsx scripts/backfill-slugs.ts
 *
 * Adds `slug = id.slice(0, 8)` to every Photo item in DynamoDB.
 * Safe to run multiple times (idempotent — same slug value derived from id).
 */
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../src/infrastructure/database/dynamodb/client";
import { TABLE_NAMES } from "../src/infrastructure/database/dynamodb/tables";

async function backfillSlugs(): Promise<void> {
  let totalScanned = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined = undefined;

  console.log("Starting slug backfill for Photos table...");
  console.log(`Table: ${TABLE_NAMES.PHOTOS}`);

  do {
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAMES.PHOTOS,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    );

    const items = scanResult.Items ?? [];
    totalScanned += items.length;

    console.log(
      `Scanned ${items.length} items (total so far: ${totalScanned})`,
    );

    for (const item of items) {
      const id = item.id as string;
      if (!id) {
        console.warn("  Skipping item with no id:", JSON.stringify(item));
        continue;
      }

      const slug = id.slice(0, 8);

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAMES.PHOTOS,
            Key: { id },
            UpdateExpression: "SET slug = :slug",
            ExpressionAttributeValues: { ":slug": slug },
          }),
        );
        totalUpdated++;
        console.log(`  Updated id=${id} → slug=${slug}`);
      } catch (err) {
        totalErrors++;
        console.error(
          `  ERROR updating id=${id}:`,
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
  console.log(`Total errors  : ${totalErrors}`);

  if (totalErrors > 0) {
    console.error(
      `\n${totalErrors} item(s) failed to update. Check logs above.`,
    );
    process.exit(1);
  }
}

await backfillSlugs();
