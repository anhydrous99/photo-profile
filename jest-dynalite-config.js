/** @type {import('jest-dynalite').Config} */
module.exports = {
  tables: [
    {
      TableName: "test_Photos",
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
    },
    {
      TableName: "test_Albums",
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
    },
    {
      TableName: "test_AlbumPhotos",
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
    },
  ],
  basePort: 8100,
};
