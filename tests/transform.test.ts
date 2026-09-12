import { resolve } from "node:path";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { parseSync } from "oxc-parser";
import { describe, expect, test } from "vitest";
import reactForwardRef from "../src/index.js";

const id = resolve("tests/fixtures/component.tsx");
const plugin = reactForwardRef({
  include: "**/*.{tsx,jsx,ts,js,mts,mjs,cts,cjs}",
});
const transform = (source: string, path = id) =>
  plugin.transform.handler(source, path);

describe("component forms", () => {
  test.each([
    "export function Button(props: Props) { return <input {...props} />; }",
    "export default function Button(props: Props) { return <input {...props} />; }",
    "export default function (props: Props) { return <input {...props} />; }",
    "export default (props: Props) => <input {...props} />;",
    "function Button(props: Props) { return <input {...props} />; } export { Button as Input }; export default Button;",
    "export const Button = (props: Props) => <input {...props} />;",
    "export const Button = function Inner(props: Props) { return <input {...props} />; };",
    "export const Button = function(props: Props) { return <input {...props} />; };",
    "export function Button({ ref = fallback, ...rest }: Props = {}) { return <input {...rest} ref={ref} />; }",
    "export function Button<T extends Props>(props: T) { return <input {...props} />; }",
    "export const Button = <T extends Props,>(props: T) => <input {...props} />;",
    "export const Button = ((props: Props) => <input {...props} />) satisfies Component;",
    "export function Button(props: Props) { const [variant, rest] = splitProps(props, button); return <ak.Button {...rest} />; }",
    'import { memo as cache } from "react"; export const Button = cache((props: Props) => <input {...props} />, compare);',
    'import * as React from "react"; export const Button = React.memo(function Inner(props: Props) { return <input {...props} />; });',
    'import React from "react"; export default React.memo((props: Props) => <input {...props} />);',
    "export const Icon = () => <svg />;",
  ])("transforms valid syntax: %s", (source) => {
    const result = transform(source);
    expect(result).not.toBeNull();
    expect(parseSync(id, result!.code).errors).toEqual([]);
    expect(transform(result!.code)).toBeNull();
  });

  test.each([
    "function splitProps(props) { return [props]; }",
    "function useButton(props) { return <input {...props} />; }",
    "function utility(props) { return <input {...props} />; }",
    "class Button extends React.Component { render() { return <input />; } }",
    "function Factory(props) { return () => <input {...props} />; }",
    "function factory() { function Button(props) { return <input {...props} />; } return Button; }",
    "const Button = hoc((props) => <input {...props} />);",
    "const Button = makeComponent();",
    "let Button = (props) => <input {...props} />;",
    "const Button = memo((props) => <input {...props} />);",
    "const Button = function Inner(props) { return <Inner {...props} />; };",
    "async function Button(props) { return <input {...props} />; }",
    "function* Button(props) { yield <input {...props} />; }",
    "function Button(props, ref) { return <input {...props} ref={ref} />; }",
    "function Button(...props) { return <input {...props[0]} />; }",
    'const Button = (props) => createElement("input", props);',
    'import { forwardRef as forward } from "react"; const Button = forward((props, ref) => <input {...props} ref={ref} />);',
    'import * as React from "react"; function Render(props) { return <input {...props} />; } export const Button = React.forwardRef(Render);',
    'import { forwardRef } from "react"; function Render(props) { return <input {...props} />; } const Alias = Render; const Other = Alias; export const Button = forwardRef(Other);',
  ])("leaves unsupported or non-component syntax unchanged: %s", (source) => {
    expect(transform(source)).toBeNull();
  });
});

test("keeps hoisted declarations, aliases, static writes, directives and comments", () => {
  const source = `#!/usr/bin/env node\n"use client";\n// Module note\nexport const Alias = Button;\n/** Button documentation */\nexport default function Button(props: Props) {\n  "use strict";\n  // Keep this comment\n  return <input {...props} />;\n}\nButton.displayName = "Custom";\nButton.variant = "primary";`;
  const result = transform(source)!;
  expect(result.code.startsWith('#!/usr/bin/env node\n"use client";')).toBe(
    true,
  );
  expect(
    result.code.indexOf(
      '(Button as typeof Button) = /* @__PURE__ */ __reactForwardRef(Button, "Button")',
    ),
  ).toBeLessThan(result.code.indexOf("export const Alias"));
  expect(result.code).toContain(source.slice(source.indexOf("// Module note")));
  expect(parseSync(id, result.code).errors).toEqual([]);
});

test("avoids bindings and references in every scope", () => {
  const source =
    "const __forwardRef = 1; const __reactForwardRef = 2; export function Button({React, __forwardRef1}: Props) { const __reactForwardRef1 = 3; return <input data-value={__forwardRef2} />; }";
  const result = transform(source)!;
  expect(result.code).toContain("forwardRef as __forwardRef3");
  expect(result.code).toContain("function __reactForwardRef2<");
  expect(result.code).toContain(source);
});

test("provides high-resolution original-source mappings", () => {
  const source =
    "// café 🐈\nexport function Button(props: Props) {\n  return <input {...props} />;\n}";
  const result = transform(source)!;
  const offset = result.code.indexOf("<input");
  const prefix = result.code.slice(0, offset).split("\n");
  const position = originalPositionFor(new TraceMap(result.map.toString()), {
    line: prefix.length,
    column: prefix.at(-1)!.length,
  });
  expect(position).toEqual({ source: id, line: 3, column: 9, name: null });
  expect(result.map.sourcesContent).toEqual([source]);
});

test.each(["js", "jsx", "mjs", "cjs"])(
  "supports %s without generating TypeScript",
  (extension) => {
    const result = transform(
      "export const Button = props => <input {...props} />;",
      id.replace(".tsx", `.${extension}`),
    )!;
    expect(result.code).not.toContain(" as unknown");
    expect(parseSync("component.jsx", result.code).errors).toEqual([]);
  },
);

test("requires intentional, non-empty source filters", () => {
  for (const include of [null, "", []]) {
    expect(() => reactForwardRef({ include })).toThrow("non-empty include");
  }
});

test("filters extensions, query requests, virtual IDs and dependencies", () => {
  const source = "export const Button = props => <input {...props} />;";
  const filtered = reactForwardRef({
    include: ["**/fixtures/**"],
    exclude: /excluded/,
  });
  for (const path of [
    resolve("other/button.tsx"),
    id.replace("component", "excluded"),
    `${id}?raw`,
    `${id}?url&x=1`,
    id.replace(".tsx", ".d.ts"),
    id.replace(".tsx", ".css"),
    `/node_modules${id}`,
    `\0${id}`,
  ]) {
    expect(filtered.transform.handler(source, path)).toBeNull();
  }
  expect(filtered.transform.handler(source, `${id}?t=123`)).not.toBeNull();
  expect(
    filtered.transform.handler(source, id.replaceAll("/", "\\")),
  ).not.toBeNull();
});

test("reports parser errors only for selected source files", () => {
  expect(() => transform("export function {")).toThrow(
    /Cannot parse.*component.tsx/,
  );
  expect(transform("export function {", "/other/style.css")).toBeNull();
});

test("keeps separately declared renders behind forwardRef aliases unchanged", () => {
  for (const source of [
    'import React from "react"; const forward = React["forwardRef"]; function Render(props) { return <input {...props} />; } export const Input = forward(Render);',
    'import { forwardRef } from "react"; function Render(props) { return <input {...props} />; } const Alias = Render; function helper() { const Alias = other; } export const Input = forwardRef(Alias);',
    'import { forwardRef } from "react"; const forward = forwardRef; const f = forward; function Render(props) { return <input {...props} />; } export const Input = f((Render as Component));',
  ])
    expect(transform(source)).toBeNull();
});

test("resolves module memo aliases without using aliases from nested scopes", () => {
  expect(
    transform(
      'import React from "react"; const cache = React.memo; const Button = cache(props => <input {...props} />);',
    ),
  ).not.toBeNull();
  expect(
    transform(
      'import React from "react"; import cache from "custom"; function helper() { const cache = React.memo; } const Button = cache(props => <input {...props} />);',
    ),
  ).toBeNull();
});

test("terminates anonymous default declarations before following expressions", () => {
  const result = transform(
    "export default function(props) { return <input {...props} /> }\n(sideEffect())",
  )!;
  expect(result.code).toContain(', "default");\n(sideEffect())');
  expect(parseSync(id, result.code).errors).toEqual([]);
});

test.each([
  "function Button(props) { return <input {...props} />; } export const Wrapped = hoc(Button);",
  "function Button(props) { return <input {...props} />; } Button({});",
  "function Button(props) { return <input {...props} />; } const Alias = Button; Alias({});",
  "function Button(props) { return <input {...props} />; } Button.call(null, {});",
])("does not break functions used through opaque calls: %s", (source) => {
  expect(transform(source)).toBeNull();
});

test("allows React.createElement references and memo aliases", () => {
  const source =
    'import { createElement, memo } from "react"; function Button(props) { return <input {...props} />; } export const element = createElement(Button); export const Memo = memo(Button);';
  expect(transform(source)).not.toBeNull();
});
