import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Remove this bootstrap option when issue #1 adds plugin tests.
    passWithNoTests: true,
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
