import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  DescribeTableCommand,
  TableDescription,
  GlobalSecondaryIndexDescription,
} from "@aws-sdk/client-dynamodb";
import { createTables, deleteTables, TABLE_NAMES } from "../tables";
import { dynamodbClient } from "../client";

describe("DynamoDB Tables", () => {
  beforeAll(async () => {
    await deleteTables();
  }, 30000);

  afterAll(async () => {
    await deleteTables();
  }, 30000);

  describe("createTables", () => {
    it("creates all three tables with correct schema", async () => {
      await createTables();

      const photosTable = await describeTable(TABLE_NAMES.PHOTOS);
      expect(photosTable).toBeDefined();
      expect(photosTable!.KeySchema).toEqual([
        { AttributeName: "id", KeyType: "HASH" },
      ]);
      expect(photosTable!.GlobalSecondaryIndexes).toHaveLength(2);
      expect(photosTable!.BillingModeSummary?.BillingMode).toBe(
        "PAY_PER_REQUEST",
      );

      const albumsTable = await describeTable(TABLE_NAMES.ALBUMS);
      expect(albumsTable).toBeDefined();
      expect(albumsTable!.KeySchema).toEqual([
        { AttributeName: "id", KeyType: "HASH" },
      ]);
      expect(albumsTable!.GlobalSecondaryIndexes).toHaveLength(2);
      expect(albumsTable!.BillingModeSummary?.BillingMode).toBe(
        "PAY_PER_REQUEST",
      );

      const albumPhotosTable = await describeTable(TABLE_NAMES.ALBUM_PHOTOS);
      expect(albumPhotosTable).toBeDefined();
      expect(albumPhotosTable!.KeySchema).toEqual([
        { AttributeName: "albumId", KeyType: "HASH" },
        { AttributeName: "photoId", KeyType: "RANGE" },
      ]);
      expect(albumPhotosTable!.GlobalSecondaryIndexes).toHaveLength(1);
      expect(albumPhotosTable!.BillingModeSummary?.BillingMode).toBe(
        "PAY_PER_REQUEST",
      );
    }, 30000);

    it("creates Photos table with correct GSIs", async () => {
      await deleteTables();
      await createTables();

      const table = await describeTable(TABLE_NAMES.PHOTOS);
      const gsis = table!.GlobalSecondaryIndexes || [];

      const statusCreatedAtGsi = gsis.find(
        (gsi: GlobalSecondaryIndexDescription) =>
          gsi.IndexName === "status-createdAt-index",
      );
      expect(statusCreatedAtGsi).toBeDefined();
      expect(statusCreatedAtGsi?.KeySchema).toEqual([
        { AttributeName: "status", KeyType: "HASH" },
        { AttributeName: "createdAt", KeyType: "RANGE" },
      ]);

      const createdAtGsi = gsis.find(
        (gsi: GlobalSecondaryIndexDescription) =>
          gsi.IndexName === "createdAt-index",
      );
      expect(createdAtGsi).toBeDefined();
      expect(createdAtGsi?.KeySchema).toEqual([
        { AttributeName: "_type", KeyType: "HASH" },
        { AttributeName: "createdAt", KeyType: "RANGE" },
      ]);
    }, 30000);

    it("creates Albums table with correct GSIs", async () => {
      await deleteTables();
      await createTables();

      const table = await describeTable(TABLE_NAMES.ALBUMS);
      const gsis = table!.GlobalSecondaryIndexes || [];

      const isPublishedSortOrderGsi = gsis.find(
        (gsi: GlobalSecondaryIndexDescription) =>
          gsi.IndexName === "isPublished-sortOrder-index",
      );
      expect(isPublishedSortOrderGsi).toBeDefined();
      expect(isPublishedSortOrderGsi?.KeySchema).toEqual([
        { AttributeName: "isPublished", KeyType: "HASH" },
        { AttributeName: "sortOrder", KeyType: "RANGE" },
      ]);

      const sortOrderGsi = gsis.find(
        (gsi: GlobalSecondaryIndexDescription) =>
          gsi.IndexName === "sortOrder-index",
      );
      expect(sortOrderGsi).toBeDefined();
      expect(sortOrderGsi?.KeySchema).toEqual([
        { AttributeName: "_type", KeyType: "HASH" },
        { AttributeName: "sortOrder", KeyType: "RANGE" },
      ]);
    }, 30000);

    it("creates AlbumPhotos table with correct GSI", async () => {
      await deleteTables();
      await createTables();

      const table = await describeTable(TABLE_NAMES.ALBUM_PHOTOS);
      const gsis = table!.GlobalSecondaryIndexes || [];

      const photoIdAlbumIdGsi = gsis.find(
        (gsi: GlobalSecondaryIndexDescription) =>
          gsi.IndexName === "photoId-albumId-index",
      );
      expect(photoIdAlbumIdGsi).toBeDefined();
      expect(photoIdAlbumIdGsi?.KeySchema).toEqual([
        { AttributeName: "photoId", KeyType: "HASH" },
        { AttributeName: "albumId", KeyType: "RANGE" },
      ]);
    }, 30000);

    it("is idempotent - calling twice does not error", async () => {
      await deleteTables();

      await createTables();
      await expect(createTables()).resolves.not.toThrow();

      const photosTable = await describeTable(TABLE_NAMES.PHOTOS);
      expect(photosTable).toBeDefined();
    }, 30000);

    it("uses PAY_PER_REQUEST billing mode for all tables", async () => {
      await deleteTables();
      await createTables();

      const photosTable = await describeTable(TABLE_NAMES.PHOTOS);
      expect(photosTable!.BillingModeSummary?.BillingMode).toBe(
        "PAY_PER_REQUEST",
      );

      const albumsTable = await describeTable(TABLE_NAMES.ALBUMS);
      expect(albumsTable!.BillingModeSummary?.BillingMode).toBe(
        "PAY_PER_REQUEST",
      );

      const albumPhotosTable = await describeTable(TABLE_NAMES.ALBUM_PHOTOS);
      expect(albumPhotosTable!.BillingModeSummary?.BillingMode).toBe(
        "PAY_PER_REQUEST",
      );
    }, 30000);
  });

  describe("deleteTables", () => {
    it("deletes all tables", async () => {
      await createTables();
      await deleteTables();

      await expect(describeTable(TABLE_NAMES.PHOTOS)).rejects.toThrow();
      await expect(describeTable(TABLE_NAMES.ALBUMS)).rejects.toThrow();
      await expect(describeTable(TABLE_NAMES.ALBUM_PHOTOS)).rejects.toThrow();
    }, 30000);

    it("is idempotent - calling twice does not error", async () => {
      await createTables();
      await deleteTables();

      await expect(deleteTables()).resolves.not.toThrow();
    }, 30000);
  });

  describe("TABLE_NAMES", () => {
    it("exports correct table names with prefix", () => {
      expect(TABLE_NAMES.PHOTOS).toBeDefined();
      expect(TABLE_NAMES.ALBUMS).toBeDefined();
      expect(TABLE_NAMES.ALBUM_PHOTOS).toBeDefined();

      expect(typeof TABLE_NAMES.PHOTOS).toBe("string");
      expect(typeof TABLE_NAMES.ALBUMS).toBe("string");
      expect(typeof TABLE_NAMES.ALBUM_PHOTOS).toBe("string");
    });
  });
});

async function describeTable(
  tableName: string,
): Promise<TableDescription | undefined> {
  const response = await dynamodbClient.send(
    new DescribeTableCommand({ TableName: tableName }),
  );
  return response.Table;
}
