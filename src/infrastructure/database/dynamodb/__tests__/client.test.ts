import { describe, it, expect } from "vitest";
import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const mockEnv = vi.hoisted(() => ({
  AWS_REGION: "us-east-1",
  DYNAMODB_ENDPOINT: "http://localhost:8000",
  DYNAMODB_TABLE_PREFIX: "test_",
}));

vi.mock("@/infrastructure/config/env", () => ({
  env: mockEnv,
}));

describe("DynamoDB Client", () => {
  it("exports docClient as DynamoDBDocumentClient instance", async () => {
    const { docClient } = await import("../client");
    expect(docClient).toBeInstanceOf(DynamoDBDocumentClient);
  });

  it("exports tablePrefix from env config", async () => {
    const { tablePrefix } = await import("../client");
    expect(tablePrefix).toBe("test_");
  });

  it("tableName() prepends prefix to table name", async () => {
    const { tableName } = await import("../client");
    expect(tableName("Photos")).toBe("test_Photos");
    expect(tableName("Albums")).toBe("test_Albums");
  });

  it("tableName() works with empty prefix", async () => {
    mockEnv.DYNAMODB_TABLE_PREFIX = "";
    vi.resetModules();
    const { tableName } = await import("../client");
    expect(tableName("Photos")).toBe("Photos");
    mockEnv.DYNAMODB_TABLE_PREFIX = "test_";
  });

  it("connects to DynamoDB Local and lists tables", async () => {
    const localClient = new DynamoDBClient({
      region: "us-east-1",
      endpoint: "http://localhost:8000",
      credentials: {
        accessKeyId: "local",
        secretAccessKey: "local",
      },
    });

    const response = await localClient.send(new ListTablesCommand({}));
    expect(response.$metadata.httpStatusCode).toBe(200);
    expect(Array.isArray(response.TableNames)).toBe(true);

    localClient.destroy();
  });
});
