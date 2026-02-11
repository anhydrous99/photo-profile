import {
  setup as dynaliteSetup,
  startDb,
  createTables,
  deleteTables,
  stopDb,
} from "jest-dynalite";
import path from "path";

export async function setup(): Promise<void> {
  dynaliteSetup(path.resolve(__dirname, "../../"));
  await startDb();
  await createTables();
  process.env.DYNAMODB_ENDPOINT = process.env.MOCK_DYNAMODB_ENDPOINT;
}

export async function teardown(): Promise<void> {
  await deleteTables();
  await stopDb();
}
