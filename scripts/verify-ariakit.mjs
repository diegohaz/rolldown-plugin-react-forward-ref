import { spawnSync } from "node:child_process";
import { mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const commit = "afb328bfa4d78b5359a8623969c2c3e204b73763";
const source =
  process.argv.slice(2).find((arg) => arg !== "--") ??
  "https://github.com/ariakit/ariakit.git";
const directory = await mkdtemp(join(tmpdir(), "forward-ref-ariakit-"));
const checkout = join(directory, "checkout");
const plugin = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const testPath = "app/src/sandbox/ariakit-ui-button/test.ts";

async function run(name, command, args, cwd, allowFailure = false) {
  console.log(`${name}: ${command} ${args.join(" ")}`);
  const log = join(directory, `${name}.log`);
  const file = await open(log, "w");
  let result;
  try {
    result = spawnSync(command, args, {
      cwd,
      env: { ...process.env, LEFTHOOK: "0" },
      stdio: ["ignore", file.fd, file.fd],
    });
  } finally {
    await file.close();
  }
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${name} failed. Read ${log}`);
  }
  return { status: result.status, log, text: await readFile(log, "utf8") };
}

console.log(`Evidence and disposable checkout: ${directory}`);
await run("build", "pnpm", ["run", "build"], dirname(dirname(plugin)));
await run(
  "clone",
  "git",
  ["clone", "--no-checkout", source, checkout],
  directory,
);
await run("checkout", "git", ["checkout", "--detach", commit], checkout);
await run("install", "pnpm", ["install", "--frozen-lockfile"], checkout);
const testFile = join(checkout, testPath);
const originalTest = await readFile(testFile, "utf8");
const skipped = 'test.skipIf(version.startsWith("18."))(';
if (!originalTest.includes(skipped))
  throw new Error("Pinned test skip changed");
await writeFile(
  testFile,
  originalTest
    .replace('import { version } from "react";\n', "")
    .replace(skipped, "test("),
);
const baseline = await run(
  "react18-baseline",
  "pnpm",
  ["test-react18", testPath],
  checkout,
  true,
);
if (
  baseline.status === 0 ||
  !baseline.text.includes("Function components cannot be given refs")
) {
  throw new Error(
    `Expected the React 18 ref-transport failure. Read ${baseline.log}`,
  );
}
const configFile = join(checkout, "vitest.config.ts");
const originalConfig = await readFile(configFile, "utf8");
const plugins = "plugins: [reactPlugin()],";
if (!originalConfig.includes(plugins))
  throw new Error("Pinned React plugin configuration changed");
await writeFile(
  configFile,
  `import { version } from "react";\nimport reactForwardRef from ${JSON.stringify(plugin)};\n` +
    originalConfig.replace(
      plugins,
      `plugins: [
          version.startsWith("18.") && reactForwardRef({
            include: ["**/packages/ariakit-ui/src/components/*.react.tsx"],
          }),
          reactPlugin(),
        ],`,
    ),
);
await run("react18-adapted", "pnpm", ["test-react18", testPath], checkout);
await run("react19-original", "pnpm", ["test", testPath], checkout);
await run(
  "integration-patch",
  "git",
  ["diff", "--", "vitest.config.ts", testPath],
  checkout,
);
console.log(
  `Verified: React 18 baseline fails; adapted React 18 and original React 19 pass.\nLogs: ${directory}`,
);
