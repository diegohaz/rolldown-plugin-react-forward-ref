import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 80,
  jsdoc: false,
  ignorePatterns: ["dist/**", "tests/fixtures/**"],
});
