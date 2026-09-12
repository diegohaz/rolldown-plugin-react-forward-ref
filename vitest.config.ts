import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import reactForwardRef from "./src/index.js";

const runtimes = [
  { name: "react18", version: "react18", adapt: true },
  { name: "react19-original", version: "react19", adapt: false },
  { name: "react19-adapted", version: "react19", adapt: true },
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["tests/*.test.ts"],
          exclude: ["tests/runtime.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      ...runtimes.map(({ name, version, adapt }) => {
        const require = createRequire(
          new URL(`./tests/fixtures/${version}/package.json`, import.meta.url),
        );
        return {
          resolve: {
            alias: [
              "react",
              "react/jsx-runtime",
              "react/jsx-dev-runtime",
              "react-dom",
              "react-dom/client",
            ].map((id) => ({
              find: new RegExp(`^${id}$`),
              replacement: require.resolve(id),
            })),
          },
          plugins: [
            adapt &&
              reactForwardRef({
                include: "**/fixtures/*.tsx",
                exclude: "**/excluded.tsx",
                elementFactories: [
                  {
                    source: "./element-factories.js",
                    imported: "createRender",
                  },
                  {
                    source: "./element-factories.js",
                    imported: "createOptionalRender",
                  },
                ],
              }),
            react(),
          ],
          test: {
            name,
            include: ["tests/runtime.test.ts"],
            environment: "jsdom",
            provide: {
              reactMajor: version === "react18" ? "18" : "19",
              adapted: adapt,
            },
          },
        };
      }),
    ],
  },
});
