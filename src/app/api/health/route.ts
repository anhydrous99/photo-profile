import { NextResponse } from "next/server";
import { db } from "@/infrastructure/database/client";
import { sql } from "drizzle-orm";
import { getStorageAdapter } from "@/infrastructure/storage";

export async function GET() {
  const checks: Record<string, { status: string; error?: string }> = {
    database: { status: "ok" },
    storage: { status: "ok" },
  };

  try {
    db.run(sql`SELECT 1`);
  } catch (e) {
    checks.database = {
      status: "error",
      error: e instanceof Error ? e.message : "Unknown database error",
    };
  }

  try {
    const adapter = getStorageAdapter();
    await adapter.listFiles("health-check/");
  } catch (e) {
    checks.storage = {
      status: "error",
      error: e instanceof Error ? e.message : "Unknown storage error",
    };
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok");

  return NextResponse.json(
    { status: allOk ? "healthy" : "unhealthy", checks },
    { status: allOk ? 200 : 503 },
  );
}
