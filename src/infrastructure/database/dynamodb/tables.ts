import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";
import { dynamodbClient, tableName } from "./client";
import { logger } from "@/infrastructure/logging/logger";

export const TABLE_NAMES = {
  PHOTOS: tableName("Photos"),
  ALBUMS: tableName("Albums"),
  ALBUM_PHOTOS: tableName("AlbumPhotos"),
} as const;

export async function createTables(): Promise<void> {
  const client = dynamodbClient;

  try {
    await createPhotosTable(client);
    logger.info("Photos table created or already exists", {
      component: "dynamodb",
      table: TABLE_NAMES.PHOTOS,
    });

    await createAlbumsTable(client);
    logger.info("Albums table created or already exists", {
      component: "dynamodb",
      table: TABLE_NAMES.ALBUMS,
    });

    await createAlbumPhotosTable(client);
    logger.info("AlbumPhotos table created or already exists", {
      component: "dynamodb",
      table: TABLE_NAMES.ALBUM_PHOTOS,
    });

    logger.info("All DynamoDB tables initialized successfully", {
      component: "dynamodb",
    });
  } catch (error) {
    logger.error("Failed to create DynamoDB tables", {
      component: "dynamodb",
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    throw error;
  }
}

export async function deleteTables(): Promise<void> {
  const client = dynamodbClient;

  try {
    await deleteTableIfExists(client, TABLE_NAMES.ALBUM_PHOTOS);
    await deleteTableIfExists(client, TABLE_NAMES.ALBUMS);
    await deleteTableIfExists(client, TABLE_NAMES.PHOTOS);

    logger.info("All DynamoDB tables deleted successfully", {
      component: "dynamodb",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceInUseException") {
      logger.warn("Table deletion in progress, retrying...", {
        component: "dynamodb",
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      return deleteTables();
    }
    logger.error("Failed to delete DynamoDB tables", {
      component: "dynamodb",
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    throw error;
  }
}

/**
 * Create Photos table
 *
 * Schema:
 * - PK: id (String)
 * - GSI1: status-createdAt-index (PK: status, SK: createdAt)
 * - GSI2: createdAt-index (PK: _type="PHOTO", SK: createdAt)
 *
 * Access patterns:
 * - findById(id) → PK lookup
 * - findByStatus(status) → GSI1 query
 * - findPaginated(status?, cursor?) → GSI1 query with cursor
 * - findAll() → GSI2 scan on _type="PHOTO"
 */
async function createPhotosTable(client: typeof dynamodbClient): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAMES.PHOTOS,
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "id", AttributeType: "S" },
          { AttributeName: "status", AttributeType: "S" },
          { AttributeName: "createdAt", AttributeType: "N" },
          { AttributeName: "_type", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        GlobalSecondaryIndexes: [
          {
            IndexName: "status-createdAt-index",
            KeySchema: [
              { AttributeName: "status", KeyType: "HASH" },
              { AttributeName: "createdAt", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
          {
            IndexName: "createdAt-index",
            KeySchema: [
              { AttributeName: "_type", KeyType: "HASH" },
              { AttributeName: "createdAt", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      }),
    );
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      // Table already exists, this is fine
      return;
    }
    throw error;
  }
}

/**
 * Create Albums table
 *
 * Schema:
 * - PK: id (String)
 * - GSI1: isPublished-sortOrder-index (PK: isPublished, SK: sortOrder)
 * - GSI2: sortOrder-index (PK: _type="ALBUM", SK: sortOrder)
 *
 * Access patterns:
 * - findById(id) → PK lookup
 * - findPublished() → GSI1 query on isPublished=1
 * - findAll() → GSI2 query on _type="ALBUM"
 */
async function createAlbumsTable(client: typeof dynamodbClient): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAMES.ALBUMS,
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "id", AttributeType: "S" },
          { AttributeName: "isPublished", AttributeType: "N" },
          { AttributeName: "sortOrder", AttributeType: "N" },
          { AttributeName: "_type", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        GlobalSecondaryIndexes: [
          {
            IndexName: "isPublished-sortOrder-index",
            KeySchema: [
              { AttributeName: "isPublished", KeyType: "HASH" },
              { AttributeName: "sortOrder", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
          {
            IndexName: "sortOrder-index",
            KeySchema: [
              { AttributeName: "_type", KeyType: "HASH" },
              { AttributeName: "sortOrder", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      }),
    );
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      // Table already exists, this is fine
      return;
    }
    throw error;
  }
}

/**
 * Create AlbumPhotos table
 *
 * Schema:
 * - PK: albumId (String)
 * - SK: photoId (String)
 * - GSI1: photoId-albumId-index (PK: photoId, SK: albumId)
 *
 * Access patterns:
 * - findByAlbumId(albumId) → PK query
 * - getAlbumIds(photoId) → GSI1 query
 */
async function createAlbumPhotosTable(
  client: typeof dynamodbClient,
): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAMES.ALBUM_PHOTOS,
        KeySchema: [
          { AttributeName: "albumId", KeyType: "HASH" },
          { AttributeName: "photoId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "albumId", AttributeType: "S" },
          { AttributeName: "photoId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        GlobalSecondaryIndexes: [
          {
            IndexName: "photoId-albumId-index",
            KeySchema: [
              { AttributeName: "photoId", KeyType: "HASH" },
              { AttributeName: "albumId", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      }),
    );
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      // Table already exists, this is fine
      return;
    }
    throw error;
  }
}

/**
 * Delete a table if it exists.
 * Idempotent - does not error if table doesn't exist.
 */
async function deleteTableIfExists(
  client: typeof dynamodbClient,
  tableName: string,
  maxAttempts: number = 10,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const describeResponse = await client.send(
        new DescribeTableCommand({ TableName: tableName }),
      );

      if (
        describeResponse.Table?.TableStatus === "DELETING" ||
        describeResponse.Table?.TableStatus === "CREATING"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }

      await client.send(new DeleteTableCommand({ TableName: tableName }));
      logger.info("Table deletion initiated", {
        component: "dynamodb",
        table: tableName,
      });

      await waitForTableDeletion(client, tableName);
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ResourceNotFoundException"
      ) {
        return;
      }
      if (error instanceof Error && error.name === "ResourceInUseException") {
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }
      }
      throw error;
    }
  }
}

async function waitForTableDeletion(
  client: typeof dynamodbClient,
  tableName: string,
  maxAttempts: number = 60,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await client.send(new DescribeTableCommand({ TableName: tableName }));
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ResourceNotFoundException"
      ) {
        logger.info("Table deleted", {
          component: "dynamodb",
          table: tableName,
        });
        return;
      }
      throw error;
    }
  }
  throw new Error(`Table ${tableName} did not delete within timeout`);
}
