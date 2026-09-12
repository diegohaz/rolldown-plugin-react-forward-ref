import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";

export default defineConfig({
  input: { index: "src/index.ts" },
  plugins: [dts({ tsconfig: "tsconfig.build.json" })],
  output: {
    dir: "dist",
    format: "esm",
    cleanDir: true,
  },
});
