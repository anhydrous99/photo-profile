import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import * as schema from "./schema";
import { env } from "@/infrastructure/config/env";

const dbPath = path.resolve(process.cwd(), env.DATABASE_PATH);
const sqlite = new Database(dbPath);
export const db = drizzle({ client: sqlite, schema });
