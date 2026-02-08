/**
 * Smoke tests for Next.js and Redis mocks.
 *
 * Validates that the global test setup (setup.ts) correctly mocks:
 * - server-only (prevents crash)
 * - next/headers (cookies/headers)
 * - next/cache (revalidation functions)
 * - ioredis (prevents TCP connection hang)
 * - bullmq (prevents Redis operations)
 *
 * These tests also serve as usage examples for Phase 17 test authors.
 */

import { describe, it, expect } from "vitest";

describe("Mock smoke tests", () => {
  it("can import server-only without crashing", async () => {
    const mod = await import("server-only");
    expect(mod).toBeDefined();
  });

  it("can import next/headers and call cookies()", async () => {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    expect(cookieStore.get).toBeDefined();
  });

  it("can import next/cache and call revalidatePath()", async () => {
    const { revalidatePath } = await import("next/cache");
    expect(() => revalidatePath("/test")).not.toThrow();
  });

  it("can import auth session module", async () => {
    const session = await import("@/infrastructure/auth/session");
    expect(session.encrypt).toBeDefined();
    expect(session.decrypt).toBeDefined();
  });

  it("can import auth dal module", async () => {
    const dal = await import("@/infrastructure/auth/dal");
    expect(dal.verifySession).toBeDefined();
  });

  it("can import ioredis without hanging", async () => {
    const { default: IORedis } = await import("ioredis");
    const instance = new IORedis();
    expect(instance).toBeDefined();
  });

  it("can import queues module without hanging", async () => {
    const queues = await import("@/infrastructure/jobs/queues");
    expect(queues.imageQueue).toBeDefined();
  });
});
