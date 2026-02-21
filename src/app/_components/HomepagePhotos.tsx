import { connection } from "next/server";
import {
  getCachedPublishedPhotoPool,
  sampleWeighted,
} from "@/lib/cachedPhotoPool";
import { HomepageClient } from "@/presentation/components/HomepageClient";

export async function HomepagePhotos() {
  await connection();

  const pool = await getCachedPublishedPhotoPool();
  const photos = sampleWeighted(pool, 10);

  if (photos.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-text-secondary">No photos available yet.</p>
      </div>
    );
  }

  return (
    <HomepageClient
      photos={photos.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        originalFilename: p.originalFilename,
        blurDataUrl: p.blurDataUrl,
        exifData: p.exifData,
        width: p.width,
        height: p.height,
      }))}
    />
  );
}
