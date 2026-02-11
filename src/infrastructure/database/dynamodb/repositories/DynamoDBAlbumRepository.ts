import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient } from "../client";
import { TABLE_NAMES } from "../tables";
import type { AlbumRepository } from "@/domain/repositories/AlbumRepository";
import type { Album } from "@/domain/entities/Album";
import type { DynamoDBPhotoRepository } from "./DynamoDBPhotoRepository";

export class DynamoDBAlbumRepository implements AlbumRepository {
  private photoRepo: DynamoDBPhotoRepository;

  constructor(photoRepo: DynamoDBPhotoRepository) {
    this.photoRepo = photoRepo;
  }

  async findById(id: string): Promise<Album | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAMES.ALBUMS,
        Key: { id },
      }),
    );
    return result.Item ? this.toDomain(result.Item) : null;
  }

  async findAll(): Promise<Album[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.ALBUMS,
        IndexName: "sortOrder-index",
        KeyConditionExpression: "#type = :type",
        ExpressionAttributeNames: { "#type": "_type" },
        ExpressionAttributeValues: { ":type": "ALBUM" },
        ScanIndexForward: true,
      }),
    );
    return (result.Items ?? []).map((item) => this.toDomain(item));
  }

  async findPublished(): Promise<Album[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.ALBUMS,
        IndexName: "isPublished-sortOrder-index",
        KeyConditionExpression: "isPublished = :published",
        ExpressionAttributeValues: { ":published": 1 },
        ScanIndexForward: true,
      }),
    );
    return (result.Items ?? []).map((item) => this.toDomain(item));
  }

  async save(album: Album): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAMES.ALBUMS,
        Item: this.toDatabase(album),
      }),
    );
  }

  async delete(id: string): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.ALBUMS,
        Key: { id },
      }),
    );

    await this.deleteAlbumPhotosEntries(id);
  }

  async getPhotoCounts(): Promise<Map<string, number>> {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAMES.ALBUMS,
        ProjectionExpression: "id, photoCount",
      }),
    );

    const counts = new Map<string, number>();
    for (const item of result.Items ?? []) {
      counts.set(
        item.id as string,
        (item.photoCount as number | undefined) ?? 0,
      );
    }
    return counts;
  }

  async updateSortOrders(albumIds: string[]): Promise<void> {
    for (let i = 0; i < albumIds.length; i += 25) {
      const batch = albumIds.slice(i, i + 25);
      const updatePromises = batch.map((albumId, batchIndex) =>
        docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAMES.ALBUMS,
            Key: { id: albumId },
            UpdateExpression: "SET sortOrder = :order",
            ExpressionAttributeValues: { ":order": i + batchIndex },
          }),
        ),
      );
      await Promise.all(updatePromises);
    }
  }

  async deleteWithPhotos(
    albumId: string,
    deletePhotos: boolean,
  ): Promise<{ deletedPhotoIds: string[] }> {
    const photoIds = await this.getAlbumPhotoIds(albumId);
    const deletedPhotoIds: string[] = [];

    if (deletePhotos && photoIds.length > 0) {
      deletedPhotoIds.push(...photoIds);
      for (const photoId of photoIds) {
        await this.photoRepo.delete(photoId);
      }
    } else if (photoIds.length > 0) {
      await this.deleteAlbumPhotosEntries(albumId);
    }

    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.ALBUMS,
        Key: { id: albumId },
      }),
    );

    return { deletedPhotoIds };
  }

  private async getAlbumPhotoIds(albumId: string): Promise<string[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.ALBUM_PHOTOS,
        KeyConditionExpression: "albumId = :albumId",
        ExpressionAttributeValues: { ":albumId": albumId },
      }),
    );
    return (result.Items ?? []).map((item) => item.photoId as string);
  }

  private async deleteAlbumPhotosEntries(albumId: string): Promise<void> {
    const photoIds = await this.getAlbumPhotoIds(albumId);
    if (photoIds.length === 0) return;

    const deleteRequests = photoIds.map((photoId) => ({
      DeleteRequest: {
        Key: { albumId, photoId },
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
  }

  private toDomain(item: Record<string, unknown>): Album {
    return {
      id: item.id as string,
      title: item.title as string,
      description: (item.description as string) ?? null,
      tags: (item.tags as string) ?? null,
      coverPhotoId: (item.coverPhotoId as string) ?? null,
      sortOrder: item.sortOrder as number,
      isPublished: item.isPublished === 1 || item.isPublished === true,
      createdAt: new Date(item.createdAt as number),
    };
  }

  private toDatabase(album: Album): Record<string, unknown> {
    return {
      id: album.id,
      title: album.title,
      description: album.description,
      tags: album.tags,
      coverPhotoId: album.coverPhotoId,
      sortOrder: album.sortOrder,
      isPublished: album.isPublished ? 1 : 0,
      createdAt: album.createdAt.getTime(),
      _type: "ALBUM",
    };
  }
}
