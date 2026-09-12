import { act, createElement, createRef, StrictMode, version } from "react";
import type { ComponentType, Ref } from "react";
import { version as domVersion } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  test,
  vi,
} from "vitest";
// The consumer's Vite/Vitest transform pipeline loads these original TSX files.
import Default, {
  Alias,
  Arrow,
  Defaults,
  Destructured,
  EarlyAlias,
  Expression,
  fallbackRef,
  Gallery,
  Generic,
  Indirect,
  Input,
  Memo,
  MemoDeclaration,
  Observe,
  observed,
  Recursive,
  Renamed,
  Shadowed,
} from "./fixtures/components.js";
import NamedDefault, {
  Alias as NamedAlias,
  EarlyAlias as NamedEarlyAlias,
} from "./fixtures/named-default.js";
import AnonymousDefault from "./fixtures/anonymous-default.js";
import ArrowDefault from "./fixtures/arrow-default.js";
import { Excluded } from "./fixtures/excluded.js";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  observed.length = 0;
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe.each(
  Object.entries({
    Input,
    Arrow,
    Expression,
    Destructured,
    Indirect,
    Memo,
    MemoDeclaration,
    Shadowed,
    Recursive,
    Generic,
    NamedDefault,
    AnonymousDefault,
    ArrowDefault,
  }),
)(
  "%s ref transport",
  (
    _name: string,
    Component: ComponentType<{
      ref?: Ref<HTMLInputElement>;
      value: string;
      readOnly?: boolean;
    }>,
  ) => {
    test("delivers object refs, preserves the node on update and clears on unmount", async () => {
      const ref = createRef<HTMLInputElement>();
      await act(() =>
        root.render(
          createElement(Component, { ref, value: "hello", readOnly: true }),
        ),
      );
      const input = container.querySelector("input");
      expect(ref.current).toBe(input);
      expect(input).not.toBeNull();
      await act(() =>
        root.render(
          createElement(Component, { ref, value: "hello", readOnly: true }),
        ),
      );
      expect(ref.current).toBe(input);
      await act(() => root.render(null));
      expect(ref.current).toBeNull();
    });
    test("delivers callback refs and clears the old ref on replacement and unmount", async () => {
      const first = vi.fn();
      const second = vi.fn();
      await act(() =>
        root.render(
          createElement(Component, {
            ref: first,
            value: "hello",
            readOnly: true,
          }),
        ),
      );
      expect(first).toHaveBeenLastCalledWith(container.querySelector("input"));
      await act(() =>
        root.render(
          createElement(Component, {
            ref: second,
            value: "hello",
            readOnly: true,
          }),
        ),
      );
      expect(first.mock.calls.at(-1)?.[0]).toBeNull();
      expect(second).toHaveBeenLastCalledWith(container.querySelector("input"));
      await act(() => root.render(null));
      expect(second.mock.calls.at(-1)?.[0]).toBeNull();
    });
  },
);

test("keeps export aliases, early references, and assigned static properties", () => {
  for (const alias of [Default, Alias, EarlyAlias, Renamed])
    expect(alias).toBe(Input);
  expect(NamedAlias).toBe(NamedDefault);
  expect(NamedEarlyAlias).toBe(NamedDefault);
  expect(Input.displayName).toBe("CustomInput");
  expect(Input.description).toBe("static property");
});

test("defines no-ref semantics for absent, undefined, and null values", async () => {
  const adapted =
    (Input as unknown as { $$typeof?: symbol }).$$typeof ===
    Symbol.for("react.forward_ref");
  for (const props of [{}, { ref: undefined }, { ref: null }]) {
    await act(() => root.render(createElement(Observe, props)));
    const last = observed.at(-1)!;
    // React 18 collapses all three to callback null and removes the special
    // prop. The adapter passes through props when the callback ref is null.
    expect(last).toEqual(
      adapted
        ? { own: false, value: undefined }
        : { own: Object.hasOwn(props, "ref"), value: props.ref },
    );
  }
  for (const ref of [undefined, null]) {
    await act(() => root.render(createElement(Defaults, { ref })));
    expect(fallbackRef.current).toBe(
      ref === null && !adapted ? null : container.querySelector("input"),
    );
  }
});

test("preserves child state across rerenders and avatar-kind changes in StrictMode", async () => {
  await act(() =>
    root.render(createElement(StrictMode, null, createElement(Gallery))),
  );
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  const image = () => container.querySelector("img")!;
  const original = image();
  expect(image().getAttribute("src")).toContain("f59e0b");
  await act(() => button("Change avatar color").click());
  expect(image().getAttribute("src")).toContain("6366f1");
  await act(() => button("Rerender").click());
  for (const pressed of ["false", "true"]) {
    await act(() => button("Round avatar").click());
    expect(button("Round avatar").getAttribute("aria-pressed")).toBe(pressed);
    expect(image().getAttribute("src")).toContain("6366f1");
    expect(image()).toBe(original);
  }
});

test("proves the excluded original fails ref transport on React 18", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const ref = createRef<HTMLInputElement>();
  await act(() => root.render(createElement(Excluded, { ref })));
  if (version.startsWith("18.")) {
    expect(ref.current).toBeNull();
    expect(error).toHaveBeenCalled();
  } else {
    expect(ref.current).toBe(container.querySelector("input"));
  }
});

declare module "vitest" {
  export interface ProvidedContext {
    reactMajor: string;
    adapted: boolean;
  }
}

test("uses the requested runtime graph and consumer transform switch", () => {
  expect(version.split(".")[0]).toBe(inject("reactMajor"));
  expect(domVersion).toBe(version);
  const adapted =
    "$$typeof" in Input && Input.$$typeof === Symbol.for("react.forward_ref");
  expect(adapted).toBe(inject("adapted"));
});
