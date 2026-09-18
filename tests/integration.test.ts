import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { rolldown } from "rolldown";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { expect, test, vi } from "vitest";
import reactForwardRef from "../src/index.js";

const entry = resolve("tests/fixtures/components.tsx");

test("Rolldown skips the transform handler for unsupported module IDs", async () => {
  const included = [
    ...["js", "jsx", "ts", "tsx", "mjs", "mts", "cjs", "cts"].map(
      (extension) => `/fixture/component.${extension}`,
    ),
    "/fixture/component.tsx?import",
    "/fixture/component.tsx?t=123&custom=1",
    "/fixture/component.tsx?rawish",
    "/fixture/component.tsx?custom=/node_modules/types.d.ts",
    "/fixture/component.tsx?custom?raw",
    "/fixture/my_node_modules/component.tsx",
    "C:\\fixture\\component.tsx?custom=1",
  ];
  const excluded = [
    "/fixture/style.css",
    "/fixture/style.css?component.tsx",
    "/fixture/data.json",
    "/fixture/component.d.ts",
    "/fixture/component.d.mts?import",
    "/fixture/component.d.cts",
    "/fixture/node_modules/component.tsx",
    "C:\\fixture\\node_modules\\component.tsx",
    "\0/fixture/component.tsx",
    "/fixture/component.tsx?raw",
    "/fixture/component.tsx?url&custom=1",
    "/fixture/component.tsx?custom=1&raw=true",
    "/fixture/component.tsx?custom=1&url",
    "/fixture/component.tsx?raw?custom=1",
  ];
  const ids = [...included, ...excluded];
  const plugin = reactForwardRef({ include: "**/*" });
  const handler = vi.fn(plugin.transform.handler);
  plugin.transform.handler = handler;
  const build = await rolldown({
    input: Object.fromEntries(ids.map((id, index) => [`entry-${index}`, id])),
    plugins: [
      plugin,
      {
        name: "hook-filter-fixtures",
        resolveId(id) {
          if (ids.includes(id)) return id;
        },
        load(id) {
          if (ids.includes(id))
            return { code: "console.log('fixture');", moduleType: "js" };
        },
      },
    ],
  });
  try {
    await build.generate({ format: "esm" });
    expect(handler.mock.calls.map(([, id]) => id).sort()).toEqual(
      included.toSorted(),
    );
  } finally {
    await build.close();
  }
});

test("Rolldown runs the source transform before JSX lowering, with chained source maps", async () => {
  let observed = false;
  const build = await rolldown({
    input: entry,
    external: /^react(?:\/|$)/,
    plugins: [
      {
        name: "verify-order",
        transform(code, id) {
          if (id === entry) {
            observed =
              code.includes("@react-forward-ref transformed") &&
              code.includes("<input");
          }
        },
      },
      reactForwardRef({ include: entry }),
    ],
  });
  try {
    const { output } = await build.generate({ format: "esm", sourcemap: true });
    const chunk = output.find((item) => item.type === "chunk")!;
    expect(observed).toBe(true);
    expect(chunk.code).toContain("forwardRef");
    expect(chunk.code).not.toContain("<input");
    expect(chunk.imports).toContain("react");
    expect(chunk.map?.sourcesContent).toContain(await readFile(entry, "utf8"));
    expect(chunk.exports).toEqual(
      expect.arrayContaining(["default", "Input", "EarlyAlias", "Renamed"]),
    );
  } finally {
    await build.close();
  }
});

test("Vite serves transformed TSX with React plugin order and source maps", async () => {
  const plugin = reactForwardRef({ include: entry });
  const handler = vi.fn(plugin.transform.handler);
  plugin.transform.handler = handler;
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, watch: null, ws: false },
    plugins: [plugin, react()],
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const result = await server.transformRequest(
      "/tests/fixtures/components.tsx",
    );
    expect(result?.code).toContain("forwardRef");
    expect(result?.code).not.toContain("<input");
    expect(result?.map).toHaveProperty(
      "sourcesContent",
      expect.arrayContaining([await readFile(entry, "utf8")]),
    );
    const excluded = await server.transformRequest(
      "/tests/fixtures/excluded.tsx",
    );
    expect(excluded?.code).not.toContain("forwardRef");
    const query = await server.transformRequest(
      "/tests/fixtures/components.tsx?custom=1",
    );
    expect(query?.code).toContain("forwardRef");
    handler.mockClear();
    for (const query of ["raw", "url", "custom=1&raw=true", "custom=1&url"]) {
      await server.transformRequest(`/tests/fixtures/components.tsx?${query}`);
    }
    expect(handler.mock.calls.map(([, id]) => id)).toEqual([]);
  } finally {
    await server.close();
  }
});

test("transformed TypeScript preserves generic props and static declarations", async () => {
  const directory = await mkdtemp(resolve("tests/fixtures/typecheck-"));
  try {
    const source = `import type { ComponentProps } from "react";
export function Input<T extends string>(props: ComponentProps<"input"> & { value: T }) { return <input {...props} />; }
Input.displayName = "Custom";
export default Input;
export const Alias = Input;
export const Arrow = <T extends string,>(props: { value: T }) => <span>{props.value}</span>;
const valid = <Input value="yes" />;
const generic = <Arrow<"yes"> value="yes" />;
// @ts-expect-error The original constraint still rejects numbers.
const invalid = <Input value={1} />;
// @ts-expect-error The original type parameter is still available.
const wrongGeneric = <Arrow<"yes"> value="no" />;
`;
    const id = `${directory}/consumer.tsx`;
    const result = reactForwardRef({
      include: "**/typecheck-*/*.tsx",
    }).transform.handler(source, id)!;
    await writeFile(id, result.code);
    execFileSync(
      resolve("node_modules/.bin/tsc"),
      [
        "--ignoreConfig",
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--jsx",
        "react-jsx",
        "--module",
        "nodenext",
        "--target",
        "es2023",
        id,
      ],
      { encoding: "utf8", stdio: "pipe" },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Rolldown can remove unused const component wrappers", async () => {
  const build = await rolldown({
    input: "/fixture/entry.tsx",
    external: /^react(?:\/|$)/,
    plugins: [
      reactForwardRef({ include: "/fixture/components.tsx" }),
      {
        name: "fixture",
        resolveId(id) {
          if (id.startsWith("/fixture/")) return id;
        },
        load(id) {
          if (id.endsWith("entry.tsx"))
            return 'export { Used } from "/fixture/components.tsx";';
          if (id.endsWith("components.tsx"))
            return 'export function Used(props) { return <input {...props} />; } export function Unused(props) { return <input {...props} data-label="unused-marker" />; } export const UnusedArrow = props => <div data-label="unused-arrow-marker" />;';
        },
      },
    ],
  });
  try {
    const { output } = await build.generate({ format: "esm" });
    const chunk = output.find((item) => item.type === "chunk")!;
    expect(chunk.code).toContain("forwardRef");
    expect(chunk.code).not.toContain("unused-arrow-marker");
  } finally {
    await build.close();
  }
});
