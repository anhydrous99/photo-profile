/**
 * End-to-end pipeline verification script
 *
 * Tests the complete image processing pipeline:
 * 1. Enqueues a job for a test image
 * 2. Waits for derivatives to be generated
 * 3. Verifies expected files are created
 *
 * Prerequisites:
 * - Redis running (docker-compose up -d)
 * - Worker running (npm run worker)
 * - Test image placed in storage/originals/{TEST_PHOTO_ID}/original.jpg
 *
 * Usage:
 *   npm run test:pipeline
 */

import { enqueueImageProcessing, imageQueue } from "@/infrastructure/jobs";
import { env } from "@/infrastructure/config/env";
import * as fs from "fs/promises";
import * as path from "path";

const TEST_PHOTO_ID = `test-pipeline-${Date.now()}`;

// Expected files: 4 sizes (300, 600, 1200, 2400) x 2 formats (webp, avif)
const EXPECTED_FILES = 8;
const POLL_INTERVAL = 2000; // 2 seconds
const TIMEOUT = 30000; // 30 seconds

async function main(): Promise<void> {
  const originalDir = path.join(env.STORAGE_PATH, "originals", TEST_PHOTO_ID);
  const derivativesDir = path.join(
    env.STORAGE_PATH,
    "processed",
    TEST_PHOTO_ID,
  );

  // Check for test image
  const testImagePath = path.join(originalDir, "original.jpg");
  try {
    await fs.access(testImagePath);
  } catch {
    console.log(`[Test] No test image found. Please place an image at:`);
    console.log(`       ${testImagePath}`);
    console.log(`[Test] Creating directory...`);
    await fs.mkdir(originalDir, { recursive: true });
    await imageQueue.close();
    process.exit(1);
  }

  console.log(`[Test] Enqueueing job for photo: ${TEST_PHOTO_ID}`);
  const jobId = await enqueueImageProcessing(TEST_PHOTO_ID, testImagePath);
  console.log(`[Test] Job enqueued with ID: ${jobId}`);
  console.log(`[Test] Waiting for derivatives (up to ${TIMEOUT / 1000}s)...`);

  // Poll for completion
  const startTime = Date.now();

  while (Date.now() - startTime < TIMEOUT) {
    try {
      const files = await fs.readdir(derivativesDir);
      console.log(`[Test] Found ${files.length}/${EXPECTED_FILES} files...`);

      if (files.length >= EXPECTED_FILES) {
        console.log(`[Test] SUCCESS! Generated derivatives:`);
        files.sort().forEach((f) => console.log(`       - ${f}`));
        await imageQueue.close();
        process.exit(0);
      }
    } catch {
      // Directory doesn't exist yet - worker hasn't started processing
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  console.error(
    `[Test] TIMEOUT: Expected ${EXPECTED_FILES} files but did not complete in ${TIMEOUT / 1000}s`,
  );
  console.error(`[Test] Ensure worker is running: npm run worker`);
  console.error(`[Test] Ensure Redis is running: docker-compose up -d`);
  await imageQueue.close();
  process.exit(1);
}

main().catch((err) => {
  console.error("[Test] Fatal error:", err);
  process.exit(1);
});
