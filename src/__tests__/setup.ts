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
vi.mock("ioredis", () => ({
  default: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    quit: vi.fn(),
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    status: "ready",
  })),
}));

// 6. react: Preserve all real exports, override cache with pass-through
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  };
});

// 7. bullmq: Mock Queue and Worker to prevent Redis operations
vi.mock("bullmq", () => ({
  Queue: vi.fn(() => ({
    add: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  })),
  Worker: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}));
