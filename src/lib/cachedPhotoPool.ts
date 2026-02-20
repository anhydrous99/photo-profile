import { unstable_cache } from "next/cache";
import { getPhotoRepository } from "@/infrastructure/database/dynamodb/repositories";
import type { PhotoPoolEntry } from "@/infrastructure/database/dynamodb/repositories/DynamoDBPhotoRepository";
import {
  weightedSample,
  shuffleArray,
} from "@/infrastructure/database/dynamodb/repositories/PhotoRandomService";
import { PHOTO_POOL_CACHE_TAG } from "@/lib/constants";

export type { PhotoPoolEntry };

export const getCachedPublishedPhotoPool = unstable_cache(
  async (): Promise<PhotoPoolEntry[]> => {
    return getPhotoRepository().getPublishedPhotoPool();
  },
  ["published-photo-pool"],
  { tags: [PHOTO_POOL_CACHE_TAG], revalidate: 300 },
);

export function sampleWeighted(
  pool: PhotoPoolEntry[],
  count: number,
): PhotoPoolEntry[] {
  if (pool.length === 0) return [];
  const weights = pool.map((entry) => entry.weight);
  return weightedSample(pool, weights, Math.min(count, pool.length));
}

export function sampleUniform(
  pool: PhotoPoolEntry[],
  count: number,
): PhotoPoolEntry[] {
  if (pool.length === 0) return [];
  const copy = [...pool];
  shuffleArray(copy);
  return copy.slice(0, count);
}
