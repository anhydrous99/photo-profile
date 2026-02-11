import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  BatchGetCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient } from "../client";
import { TABLE_NAMES } from "../tables";
import type {
  PhotoRepository,
  PaginatedResult,
  PaginationOptions,
} from "@/domain/repositories/PhotoRepository";
import type { Photo, ExifData } from "@/domain/entities/Photo";

export class DynamoDBPhotoRepository implements PhotoRepository {
  async findById(id: string): Promise<Photo | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAMES.PHOTOS,
        Key: { id },
      }),
    );
    return result.Item ? this.toDomain(result.Item) : null;
  }

  async findAll(): Promise<Photo[]> {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAMES.PHOTOS,
      }),
    );
    return (result.Items ?? []).map((item) => this.toDomain(item));
  }

  async findPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResult<Photo>> {
    const { limit, cursor, status, albumFilter } = options;

    if (albumFilter === "none") {
      return this.findPaginatedWithAlbumFilter(options);
    }

    if (status) {
      return this.findPaginatedByStatus(limit, cursor, status);
    }

    return this.findPaginatedAll(limit, cursor);
  }

  private async findPaginatedAll(
    limit: number,
    cursor?: string,
  ): Promise<PaginatedResult<Photo>> {
    const exclusiveStartKey = cursor
      ? JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"))
      : undefined;

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.PHOTOS,
        IndexName: "createdAt-index",
        KeyConditionExpression: "#type = :type",
        ExpressionAttributeNames: { "#type": "_type" },
        ExpressionAttributeValues: { ":type": "PHOTO" },
        ScanIndexForward: false,
        Limit: limit + 1,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = result.Items ?? [];
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      const lastEvaluatedKey = {
        id: lastItem.id,
        _type: "PHOTO",
        createdAt: lastItem.createdAt,
      };
      nextCursor = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString(
        "base64",
      );
    }

    return {
      data: pageItems.map((item) => this.toDomain(item)),
      nextCursor,
    };
  }

  private async findPaginatedByStatus(
    limit: number,
    cursor: string | undefined,
    status: Photo["status"],
  ): Promise<PaginatedResult<Photo>> {
    const exclusiveStartKey = cursor
      ? JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"))
      : undefined;

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.PHOTOS,
        IndexName: "status-createdAt-index",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status },
        ScanIndexForward: false,
        Limit: limit + 1,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = result.Items ?? [];
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      const lastEvaluatedKey = {
        id: lastItem.id,
        status: lastItem.status,
        createdAt: lastItem.createdAt,
      };
      nextCursor = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString(
        "base64",
      );
    }

    return {
      data: pageItems.map((item) => this.toDomain(item)),
      nextCursor,
    };
  }

  private async findPaginatedWithAlbumFilter(
    options: PaginationOptions,
  ): Promise<PaginatedResult<Photo>> {
    const { limit, cursor, status } = options;

    const assignedPhotoIds = await this.getAllAssignedPhotoIds();

    const exclusiveStartKey = cursor
      ? JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"))
      : undefined;

    const collected: Record<string, unknown>[] = [];
    let lastKey = exclusiveStartKey;
    let exhausted = false;

    while (collected.length < limit + 1 && !exhausted) {
      const batchLimit = (limit + 1) * 3;

      const result = status
        ? await docClient.send(
            new QueryCommand({
              TableName: TABLE_NAMES.PHOTOS,
              IndexName: "status-createdAt-index",
              KeyConditionExpression: "#status = :status",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: { ":status": status },
              ScanIndexForward: false,
              Limit: batchLimit,
              ExclusiveStartKey: lastKey,
            }),
          )
        : await docClient.send(
            new QueryCommand({
              TableName: TABLE_NAMES.PHOTOS,
              IndexName: "createdAt-index",
              KeyConditionExpression: "#type = :type",
              ExpressionAttributeNames: { "#type": "_type" },
              ExpressionAttributeValues: { ":type": "PHOTO" },
              ScanIndexForward: false,
              Limit: batchLimit,
              ExclusiveStartKey: lastKey,
            }),
          );

      const items = result.Items ?? [];
      for (const item of items) {
        if (!assignedPhotoIds.has(item.id as string)) {
          collected.push(item);
          if (collected.length > limit) break;
        }
      }

      lastKey = result.LastEvaluatedKey;
      if (!lastKey || items.length === 0) {
        exhausted = true;
      }
    }

    const hasMore = collected.length > limit;
    const pageItems = hasMore ? collected.slice(0, limit) : collected;

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      const lastEvaluatedKey: Record<string, unknown> = {
        id: lastItem.id,
        createdAt: lastItem.createdAt,
      };
      if (status) {
        lastEvaluatedKey.status = lastItem.status;
      } else {
        lastEvaluatedKey._type = "PHOTO";
      }
      nextCursor = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString(
        "base64",
      );
    }

    return {
      data: pageItems.map((item) => this.toDomain(item)),
      nextCursor,
    };
  }

  private async getAllAssignedPhotoIds(): Promise<Set<string>> {
    const photoIds = new Set<string>();
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAMES.ALBUM_PHOTOS,
          ProjectionExpression: "photoId",
          ExclusiveStartKey: lastKey,
        }),
      );

      for (const item of result.Items ?? []) {
        photoIds.add(item.photoId as string);
      }

      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return photoIds;
  }

  async findByAlbumId(albumId: string): Promise<Photo[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.ALBUM_PHOTOS,
        KeyConditionExpression: "albumId = :albumId",
        ExpressionAttributeValues: { ":albumId": albumId },
      }),
    );

    const albumPhotoItems = result.Items ?? [];
    if (albumPhotoItems.length === 0) return [];

    const sorted = albumPhotoItems.sort(
      (a, b) => (a.sortOrder as number) - (b.sortOrder as number),
    );

    const photoIds = sorted.map((item) => item.photoId as string);
    const photos = await this.batchGetPhotos(photoIds);

    const photoMap = new Map<string, Photo>();
    for (const photo of photos) {
      photoMap.set(photo.id, photo);
    }

    return photoIds
      .map((id) => photoMap.get(id))
      .filter((p): p is Photo => p !== undefined);
  }

  async save(photo: Photo): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAMES.PHOTOS,
        Item: this.toDatabase(photo),
      }),
    );
  }

  async delete(id: string): Promise<void> {
    const albumIds = await this.getAlbumIds(id);

    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.PHOTOS,
        Key: { id },
      }),
    );

    if (albumIds.length > 0) {
      const deleteRequests = albumIds.map((albumId) => ({
        DeleteRequest: {
          Key: { albumId, photoId: id },
        },
      }));

      for (let i = 0; i < deleteRequests.length; i += 25) {
        const batch = deleteRequests.slice(i, i + 25);
        await docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAMES.ALBUM_PHOTOS]: batch,
            },
          }),
        );
      }

      for (const albumId of albumIds) {
        await this.decrementAlbumPhotoCount(albumId);
      }
    }
  }

  async getAlbumIds(photoId: string): Promise<string[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.ALBUM_PHOTOS,
        IndexName: "photoId-albumId-index",
        KeyConditionExpression: "photoId = :photoId",
        ExpressionAttributeValues: { ":photoId": photoId },
      }),
    );

    return (result.Items ?? []).map((item) => item.albumId as string);
  }

  async addToAlbum(photoId: string, albumId: string): Promise<void> {
    const existingResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAMES.ALBUM_PHOTOS,
        Key: { albumId, photoId },
      }),
    );

    if (existingResult.Item) return;

    const maxSortOrder = await this.getMaxSortOrder(albumId);
    const nextOrder = maxSortOrder + 1;

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAMES.ALBUM_PHOTOS,
        Item: { albumId, photoId, sortOrder: nextOrder },
      }),
    );

    await this.incrementAlbumPhotoCount(albumId, photoId);
  }

  async removeFromAlbum(photoId: string, albumId: string): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.ALBUM_PHOTOS,
        Key: { albumId, photoId },
      }),
    );

    await this.decrementAlbumPhotoCount(albumId);
  }

  async updatePhotoSortOrders(
    albumId: string,
    photoIds: string[],
  ): Promise<void> {
    const putRequests = photoIds.map((photoId, index) => ({
      PutRequest: {
        Item: { albumId, photoId, sortOrder: index },
      },
    }));

    for (let i = 0; i < putRequests.length; i += 25) {
      const batch = putRequests.slice(i, i + 25);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAMES.ALBUM_PHOTOS]: batch,
          },
        }),
      );
    }
  }

  async findRandomFromPublishedAlbums(limit: number): Promise<Photo[]> {
    const publishedAlbums = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.ALBUMS,
        IndexName: "isPublished-sortOrder-index",
        KeyConditionExpression: "isPublished = :published",
        ExpressionAttributeValues: { ":published": 1 },
      }),
    );

    const albumIds = (publishedAlbums.Items ?? []).map(
      (item) => item.id as string,
    );
    if (albumIds.length === 0) return [];

    const allPhotoIds = new Set<string>();
    for (const albumId of albumIds) {
      const albumPhotos = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAMES.ALBUM_PHOTOS,
          KeyConditionExpression: "albumId = :albumId",
          ExpressionAttributeValues: { ":albumId": albumId },
        }),
      );

      for (const item of albumPhotos.Items ?? []) {
        allPhotoIds.add(item.photoId as string);
      }
    }

    if (allPhotoIds.size === 0) return [];

    const photos = await this.batchGetPhotos([...allPhotoIds]);
    const readyPhotos = photos.filter((p) => p.status === "ready");

    this.shuffleArray(readyPhotos);
    return readyPhotos.slice(0, limit);
  }

  async findBySlugPrefix(slug: string): Promise<Photo | null> {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAMES.PHOTOS,
        FilterExpression: "begins_with(id, :slug)",
        ExpressionAttributeValues: { ":slug": slug },
        Limit: 1,
      }),
    );

    const items = result.Items ?? [];
    return items.length > 0 ? this.toDomain(items[0]) : null;
  }

  async findByStatus(status: Photo["status"]): Promise<Photo[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.PHOTOS,
        IndexName: "status-createdAt-index",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status },
      }),
    );

    return (result.Items ?? []).map((item) => this.toDomain(item));
  }

  async findStaleProcessing(thresholdMs: number): Promise<Photo[]> {
    const cutoff = Date.now() - thresholdMs;

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.PHOTOS,
        IndexName: "status-createdAt-index",
        KeyConditionExpression: "#status = :status AND createdAt < :cutoff",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": "processing",
          ":cutoff": cutoff,
        },
      }),
    );

    return (result.Items ?? []).map((item) => this.toDomain(item));
  }

  private async batchGetPhotos(photoIds: string[]): Promise<Photo[]> {
    if (photoIds.length === 0) return [];

    const photos: Photo[] = [];

    for (let i = 0; i < photoIds.length; i += 100) {
      const batch = photoIds.slice(i, i + 100);
      const keys = batch.map((id) => ({ id }));

      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [TABLE_NAMES.PHOTOS]: { Keys: keys },
          },
        }),
      );

      const items = result.Responses?.[TABLE_NAMES.PHOTOS] ?? [];
      photos.push(...items.map((item) => this.toDomain(item)));
    }

    return photos;
  }

  private async getMaxSortOrder(albumId: string): Promise<number> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.ALBUM_PHOTOS,
        KeyConditionExpression: "albumId = :albumId",
        ExpressionAttributeValues: { ":albumId": albumId },
        ScanIndexForward: false,
        Limit: 1,
        ProjectionExpression: "sortOrder",
      }),
    );

    const items = result.Items ?? [];
    if (items.length === 0) return -1;
    return items[0].sortOrder as number;
  }

  private async incrementAlbumPhotoCount(
    albumId: string,
    photoId: string,
  ): Promise<void> {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAMES.ALBUMS,
          Key: { id: albumId },
          UpdateExpression:
            "SET photoCount = if_not_exists(photoCount, :zero) + :one",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":one": 1,
          },
        }),
      );
    } catch {
      // no-op: album may not exist
    }
  }

  private async decrementAlbumPhotoCount(albumId: string): Promise<void> {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAMES.ALBUMS,
          Key: { id: albumId },
          UpdateExpression:
            "SET photoCount = if_not_exists(photoCount, :one) - :one",
          ExpressionAttributeValues: {
            ":one": 1,
          },
        }),
      );
    } catch {
      // no-op: album may not exist
    }
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private toDomain(item: Record<string, unknown>): Photo {
    return {
      id: item.id as string,
      title: (item.title as string) ?? null,
      description: (item.description as string) ?? null,
      originalFilename: item.originalFilename as string,
      blurDataUrl: (item.blurDataUrl as string) ?? null,
      exifData: item.exifData ? (item.exifData as ExifData) : null,
      width:
        item.width !== undefined && item.width !== null
          ? (item.width as number)
          : null,
      height:
        item.height !== undefined && item.height !== null
          ? (item.height as number)
          : null,
      status: item.status as Photo["status"],
      createdAt: new Date(item.createdAt as number),
      updatedAt: new Date(item.updatedAt as number),
    };
  }

  private toDatabase(photo: Photo): Record<string, unknown> {
    return {
      id: photo.id,
      title: photo.title,
      description: photo.description,
      originalFilename: photo.originalFilename,
      blurDataUrl: photo.blurDataUrl,
      exifData: photo.exifData,
      width: photo.width,
      height: photo.height,
      status: photo.status,
      createdAt: photo.createdAt.getTime(),
      updatedAt: photo.updatedAt.getTime(),
      _type: "PHOTO",
    };
  }
}
