import { NextResponse } from "next/server";
import { docClient } from "@/infrastructure/database/dynamodb/client";
import { ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { getStorageAdapter } from "@/infrastructure/storage";

export async function GET() {
  const checks: Record<string, { status: string; error?: string }> = {
    database: { status: "ok" },
    storage: { status: "ok" },
  };

  try {
    await docClient.send(new ListTablesCommand({}));
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
