import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

test("installs the packed package and checks its API from a separate consumer", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "react-forward-ref-consumer-"),
  );
  const tarball = join(directory, "plugin.tgz");
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  const run = (command: string, args: string[], cwd = directory) =>
    execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 60_000,
    });
  try {
    run("pnpm", ["pack", "--out", tarball], process.cwd());
    const files = run("tar", ["-tzf", tarball]).trim().split("\n");
    expect(files).toEqual(
      expect.arrayContaining([
        "package/dist/index.js",
        "package/dist/index.d.ts",
        "package/README.md",
        "package/LICENSE",
        "package/package.json",
      ]),
    );
    expect(
      files.every((file) =>
        /^package\/(?:dist\/|README.md$|LICENSE$|package.json$)/.test(file),
      ),
    ).toBe(true);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        packageManager: manifest.packageManager,
        dependencies: { [manifest.name]: "file:./plugin.tgz" },
        devDependencies: Object.fromEntries(
          ["typescript", "rolldown", "vite", "@types/node"].map((name) => [
            name,
            manifest.devDependencies[name],
          ]),
        ),
      }),
    );
    run("pnpm", ["install", "--prefer-offline", "--ignore-scripts"]);
    const installed = JSON.parse(
      await readFile(
        join(directory, "node_modules", manifest.name, "package.json"),
        "utf8",
      ),
    );
    expect(installed.dependencies).toEqual(manifest.dependencies);
    expect(installed.dependencies).not.toHaveProperty("react");
    expect(installed.peerDependencies ?? {}).not.toHaveProperty("react");
    const runtime = await readFile(
      join(directory, "node_modules", manifest.name, "dist/index.js"),
      "utf8",
    );
    for (const dependency of Object.keys(manifest.dependencies))
      expect(runtime).toContain(`from "${dependency}"`);
    await writeFile(
      join(directory, "consumer.ts"),
      `import plugin from "rolldown-plugin-react-forward-ref";
import type { Options, ReactForwardRefPlugin } from "rolldown-plugin-react-forward-ref";
import type { Plugin as RolldownPlugin } from "rolldown";
import type { Plugin as VitePlugin } from "vite";
const options: Options = { include: ["src/**/*.tsx", /components/], exclude: "**/*.test.tsx" };
const own: ReactForwardRefPlugin = plugin(options);
const rolldown: RolldownPlugin = own;
const vite: VitePlugin = own;
// @ts-expect-error File selection is required.
plugin();
`,
    );
    run(join(directory, "node_modules/.bin/tsc"), [
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--module",
      "nodenext",
      "--target",
      "es2023",
      "consumer.ts",
    ]);
    await writeFile(
      join(directory, "consumer.mjs"),
      `import assert from "node:assert/strict";
import plugin from "rolldown-plugin-react-forward-ref";
const transform = plugin({ include: "**/*.tsx" }).transform.handler;
const output = transform("export const Input = props => <input {...props} />", "/src/input.tsx");
assert.match(output.code, /forwardRef/);
assert.equal(transform(output.code, "/src/input.tsx"), null);
`,
    );
    run(process.execPath, ["consumer.mjs"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
