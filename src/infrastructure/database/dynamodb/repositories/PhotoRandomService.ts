import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../client";
import { TABLE_NAMES } from "../tables";
import type { Photo } from "@/domain/entities/Photo";
import type { ExifData } from "@/domain/entities/Photo";

export interface PhotoPoolEntry {
  id: string;
  title: string | null;
  description: string | null;
  originalFilename: string;
  blurDataUrl: string | null;
  exifData: ExifData | null;
  width: number | null;
  height: number | null;
  weight: number;
}

export function calculateAlbumWeight(
  rankIndex: number,
  maxRankIndex: number,
  biasFactor: number = 3,
): number {
  return 1 + (1 - rankIndex / Math.max(1, maxRankIndex)) * (biasFactor - 1);
}

export function weightedSample<T>(
  items: T[],
  weights: number[],
  count: number,
): T[] {
  const selected: T[] = [];
  const workingWeights = [...weights];

  for (let pick = 0; pick < count; pick++) {
    const cumulative: number[] = [];
    let total = 0;
    for (let i = 0; i < workingWeights.length; i++) {
      total += workingWeights[i];
      cumulative.push(total);
    }

    if (total <= 0) break;

    const random = Math.random() * total;
    let selectedIndex = 0;
    for (let i = 0; i < cumulative.length; i++) {
      if (random < cumulative[i]) {
        selectedIndex = i;
        break;
      }
    }

    selected.push(items[selectedIndex]);
    workingWeights[selectedIndex] = 0;
  }

  return selected;
}

export function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export class PhotoRandomService {
  constructor(private batchGetPhotos: (ids: string[]) => Promise<Photo[]>) {}

  async getPublishedPhotoPool(): Promise<PhotoPoolEntry[]> {
    const publishedAlbums = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.ALBUMS,
        IndexName: "isPublished-sortOrder-index",
        KeyConditionExpression: "isPublished = :published",
        ExpressionAttributeValues: { ":published": 1 },
      }),
    );

    const albumsWithRank = (publishedAlbums.Items ?? []).map((item, index) => ({
      id: item.id as string,
      rankIndex: index,
    }));
    if (albumsWithRank.length === 0) return [];

    const allPhotoIds = new Set<string>();
    const photoToBestRank = new Map<string, number>();
    for (const { id: albumId, rankIndex } of albumsWithRank) {
      const albumPhotos = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAMES.ALBUM_PHOTOS,
          KeyConditionExpression: "albumId = :albumId",
          ExpressionAttributeValues: { ":albumId": albumId },
        }),
      );

      for (const item of albumPhotos.Items ?? []) {
        const photoId = item.photoId as string;
        allPhotoIds.add(photoId);
        const currentBest = photoToBestRank.get(photoId);
        if (currentBest === undefined || rankIndex < currentBest) {
          photoToBestRank.set(photoId, rankIndex);
        }
      }
    }

    if (allPhotoIds.size === 0) return [];

    const photos = await this.batchGetPhotos([...allPhotoIds]);
    const readyPhotos = photos.filter((p) => p.status === "ready");

    const maxRankIndex = Math.max(albumsWithRank.length - 1, 1);
    return readyPhotos.map((photo) => {
      const rank = photoToBestRank.get(photo.id) ?? maxRankIndex;
      return {
        id: photo.id,
        title: photo.title,
        description: photo.description,
        originalFilename: photo.originalFilename,
        blurDataUrl: photo.blurDataUrl,
        exifData: photo.exifData,
        width: photo.width,
        height: photo.height,
        weight: calculateAlbumWeight(rank, maxRankIndex),
      };
    });
  }

  async findRandomFromPublishedAlbums(
    limit: number,
    options?: { weighted?: boolean },
  ): Promise<Photo[]> {
    const publishedAlbums = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.ALBUMS,
        IndexName: "isPublished-sortOrder-index",
        KeyConditionExpression: "isPublished = :published",
        ExpressionAttributeValues: { ":published": 1 },
      }),
    );

    const albumsWithRank = (publishedAlbums.Items ?? []).map((item, index) => ({
      id: item.id as string,
      rankIndex: index,
    }));
    if (albumsWithRank.length === 0) return [];

    const allPhotoIds = new Set<string>();
    const photoToBestRank = new Map<string, number>();
    for (const { id: albumId, rankIndex } of albumsWithRank) {
      const albumPhotos = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAMES.ALBUM_PHOTOS,
          KeyConditionExpression: "albumId = :albumId",
          ExpressionAttributeValues: { ":albumId": albumId },
        }),
      );

      for (const item of albumPhotos.Items ?? []) {
        const photoId = item.photoId as string;
        allPhotoIds.add(photoId);
        const currentBest = photoToBestRank.get(photoId);
        if (currentBest === undefined || rankIndex < currentBest) {
          photoToBestRank.set(photoId, rankIndex);
        }
      }
    }

    if (allPhotoIds.size === 0) return [];

    const photos = await this.batchGetPhotos([...allPhotoIds]);
    const readyPhotos = photos.filter((p) => p.status === "ready");

    if (options?.weighted && albumsWithRank.length > 1) {
      const maxRankIndex = albumsWithRank.length - 1;
      const weights = readyPhotos.map((photo) => {
        const rank = photoToBestRank.get(photo.id) ?? maxRankIndex;
        return calculateAlbumWeight(rank, maxRankIndex);
      });
      return weightedSample(
        readyPhotos,
        weights,
        Math.min(limit, readyPhotos.length),
      );
    }

    shuffleArray(readyPhotos);
    return readyPhotos.slice(0, limit);
  }
}
