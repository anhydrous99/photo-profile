/**
 * Global test setup file - loaded before every test via vitest.config.ts setupFiles.
 *
 * Contains ONLY vi.mock() calls. Does NOT import the mocked modules directly
 * (Vitest known issue: mocks fail if the setup file itself imports the mocked module).
 */

import { vi } from "vitest";

// 1. server-only: Prevents "cannot import from Client Component" crash
vi.mock("server-only", () => ({}));

// 2. next/headers: Mock cookies() and headers()
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map()),
}));

// 3. next/navigation: Mock routing utilities
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// 4. next/cache: Mock revalidation functions
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

// 5. ioredis: Mock Redis constructor to prevent TCP connection attempts
//    Uses regular function (not arrow) so it can be called with `new`
vi.mock("ioredis", () => {
  const MockRedis = vi.fn(function (this: Record<string, unknown>) {
    this.connect = vi.fn();
    this.disconnect = vi.fn();
    this.quit = vi.fn();
    this.on = vi.fn();
    this.get = vi.fn();
    this.set = vi.fn();
    this.del = vi.fn();
    this.status = "ready";
  });
  return { default: MockRedis };
});

// 6. react: Preserve all real exports, override cache with pass-through
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  };
});

// 7. bullmq: Mock Queue and Worker to prevent Redis operations
//    Uses regular functions (not arrows) so they can be called with `new`
vi.mock("bullmq", () => {
  const MockQueue = vi.fn(function (this: Record<string, unknown>) {
    this.add = vi.fn();
    this.close = vi.fn();
    this.on = vi.fn();
  });
  const MockWorker = vi.fn(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.close = vi.fn();
  });
  return { Queue: MockQueue, Worker: MockWorker };
});
