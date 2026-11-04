import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure helper tests live next to the code they cover. Keep the pattern
    // explicit so future DOM tests (`.test.tsx`) are picked up too.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
