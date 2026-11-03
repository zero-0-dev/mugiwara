import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
