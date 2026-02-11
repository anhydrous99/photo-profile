import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./src/__tests__/globalSetup.ts"],
    env: {
      DATABASE_PATH: ":memory:",
      STORAGE_PATH: "/tmp/test-storage",
      STORAGE_BACKEND: "filesystem",
      AUTH_SECRET: "test-secret-key-must-be-at-least-32-chars-long!!",
      ADMIN_PASSWORD_HASH:
        "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVW",
      NODE_ENV: "test",
      REDIS_URL: "redis://localhost:6379",
      DYNAMODB_TABLE_PREFIX: "test_",
    },
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/infrastructure/**/*.ts"],
      exclude: [],
      reporter: ["text", "html", "json"],
      reportsDirectory: "./coverage",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/domain": path.resolve(__dirname, "./src/domain"),
      "@/application": path.resolve(__dirname, "./src/application"),
      "@/infrastructure": path.resolve(__dirname, "./src/infrastructure"),
      "@/presentation": path.resolve(__dirname, "./src/presentation"),
    },
  },
});
