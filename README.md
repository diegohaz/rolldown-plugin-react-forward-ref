# rolldown-plugin-react-forward-ref

Run selected React 19-style function components on React 18. The plugin adds
`forwardRef` wrappers at module initialization and passes the received ref to the
original function as a prop. It supports indirect forwarding:

```tsx
export function Button(props: ButtonProps) {
  const [variantProps, rest] = splitProps(props, button);
  return <BaseButton {...button.jsx(variantProps)} {...rest} />;
}
```

The ref reaches `splitProps` before the function reads props. There is no extra
React element around the original function, and wrappers keep their identity
across renders. This package adapts **ref transport only**. It does not polyfill
other React 19 features.

The first release is in development. The package is not published yet. After
publication, install it as a development dependency:

```sh
pnpm add -D rolldown-plugin-react-forward-ref
```

## API and file selection

```ts
import reactForwardRef from "rolldown-plugin-react-forward-ref";

reactForwardRef({
  include: ["src/components/**/*.tsx", "src/examples/**/*.tsx"],
  exclude: ["**/*.test.tsx", "**/legacy/**"],
});
```

`include` is required and must be a non-empty glob, regular expression, or array
of those patterns. `exclude` accepts the same forms and takes priority. Globs
use `@rollup/pluginutils` and resolve relative to `process.cwd()`. Paths use
forward slashes on all platforms. There are no project-specific path defaults.

Only `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.mts`, `.cjs`, `.cts`, are eligible. Declaration files, virtual modules, `node_modules`, and
Vite `?raw`/`?url` requests are always excluded. JSX in JavaScript files is parsed;
the host must also be configured to lower JSX for the selected extension. Other query suffixes are removed
before matching. Input must be an ES module; the plugin does not convert CommonJS
module exports.

There is one default export for Rolldown, Vite, and Vitest. The plugin uses a
`transform` hook, with `order: "pre"` and Vite's `enforce: "pre"`. It runs before
TypeScript/JSX lowering, in both development and builds. Put it **before** other
plugins with pre-transform hooks, including `@vitejs/plugin-react`. Already
lowered JSX cannot be detected.

Version selection belongs to the consumer configuration. The plugin does not
read a React version or enable itself automatically.

## Rolldown

```ts
import { defineConfig } from "rolldown";
import reactForwardRef from "rolldown-plugin-react-forward-ref";

export default defineConfig({
  input: "src/index.tsx",
  plugins: [reactForwardRef({ include: "src/components/**/*.tsx" })],
  external: /^react(?:\/|$)/,
  output: { dir: "dist", format: "esm", sourcemap: true },
});
```

## Vite

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import reactForwardRef from "rolldown-plugin-react-forward-ref";

export default defineConfig({
  plugins: [reactForwardRef({ include: "src/components/**/*.tsx" }), react()],
});
```

## React 18-only Vitest configuration

Read the version from the **test workspace's** dependency graph. An isolated
React 18 workspace must install matching React and React DOM versions.

```ts
import react from "@vitejs/plugin-react";
import { version } from "react";
import { defineConfig } from "vitest/config";
import reactForwardRef from "rolldown-plugin-react-forward-ref";

export default defineConfig({
  plugins: [
    version.startsWith("18.") &&
      reactForwardRef({
        include: ["src/ui/**/*.tsx", "src/examples/**/*.tsx"],
      }),
    react(),
  ],
  test: { environment: "jsdom" },
});
```

For projects that alias React, use an explicit target flag instead if the
configuration's `react` import does not resolve to the test runtime. Disable the
plugin for React 19 to retain its native behavior. The test suite also checks
adapted output on React 19, with the no-ref semantics below.

## Component selection

Within each selected file, the plugin selects top-level function declarations
and `const` function initializers with an ASCII uppercase first letter and JSX
in their own function body. A default-exported function can have any name or be
anonymous, except names with the hook prefix `use` followed by an uppercase
letter or digit. JSX in nested functions or classes does not count. A visible `ref`
read is **not** required. Hooks and ordinary lowercase utilities stay unchanged.

This is a syntax rule, not proof that a function is a React component. Limit the
file filters to component source. A PascalCase utility with JSX that otherwise
meets the rule is indistinguishable from a component. Functions used as direct
calls, constructors, `.call`/`.apply`/`.bind` targets, or arguments to opaque
functions are conservatively left unchanged. This also protects render functions
passed to existing `forwardRef` calls or custom HOCs. Local identifier aliases
are followed; this conservative check can also skip a same-named binding in
another scope.

| Source form                                                                 | Behavior                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `function Button(props) { return <input {...props} /> }`                    | Wrap the hoisted binding before module statements run.                             |
| Named exports, `export { Button as Input }`, and `export default Button`    | Keep the export names and shared component identity.                               |
| `export default function Button(props) { ... }`                             | Keep its local binding and live default export.                                    |
| Anonymous default function or arrow                                         | Wrap the expression once, with display name `default`.                             |
| `const Button = props => <input {...props} />`                              | Wrap the initializer once.                                                         |
| Anonymous or named function expression                                      | Wrap it unless its private function name is referenced in its body.                |
| Destructured, defaulted, optional, or generic props                         | Call the original function with the merged props, before parameter initialization. |
| `const Alias = Button`                                                      | Share the wrapper. Aliases do not select lowercase or imported functions.          |
| `memo(Button)`                                                              | Keep `memo` outside the selected component wrapper.                                |
| `const Button = memo(props => <input {...props} />)`                        | Wrap the inner function, preserving the comparator argument.                       |
| `forwardRef(...)`                                                           | Leave it and its render input unchanged.                                           |
| Opaque HOCs and component factories                                         | Leave inline/returned functions and their identifier inputs unchanged.             |
| Class, nested, async, generator, `let`/`var` functions                      | Leave unchanged.                                                                   |
| Functions with multiple parameters, rest parameters, or array destructuring | Leave unchanged.                                                                   |
| Components without JSX, including `createElement`-only bodies               | Leave unchanged.                                                                   |

`memo`, `forwardRef`, and `createElement` are recognized through React named,
default, or namespace imports and module-level method aliases such as
`const cache = React.memo`. Destructured aliases and namespace aliases are not
resolved. Literal computed
access, such as `React["memo"]`, is supported. Dynamic API lookups, re-exports
from other modules, and component registries are not resolved. Imported
components must be adapted in their own source module. `React.createElement`
references to a selected local component are supported.

## Runtime, types, and source preservation

The implementation uses Oxc's TypeScript/JSX AST and MagicString source edits.
The component body, parameter syntax, directives, and comments remain in the
source map. Generated names avoid all identifiers in the module, including
nested bindings and references. A fresh named import from `react` avoids a
shadowed `React` value and works without an existing React value import.

A small generated helper calls the original render function directly. It sets
`displayName` to the component binding name. Later writes such as
`Button.displayName = "Custom"` and `Button.variant = "primary"` target the
wrapper. Existing aliases, early module references, and recursive JSX in
function declarations refer to that same wrapper. No wrapper is created during
a render.

Function declarations keep their hoisting. Their binding is reassigned in a
module prelude. This can make bundlers retain unused function declarations.
`const` wrappers have pure annotations and can be removed when unused. TypeScript output uses a typed assignment and a generic identity
signature to retain the original component's props and generic call signature.
This is a runtime adapter, not a declaration migration to React 18 types. Keep
source typechecking separate from the React 18 compatibility test run.

The runtime value is a React `forwardRef` object. Do not rely on its JavaScript
`.name`, `.length`, prototype, or callability. Runtime-generated calls that the
syntax checks cannot see remain unsupported. Cyclic imports that observe a
component before its module evaluates can still see the original hoisted
function. The transform does not guarantee identity during such partial module
initialization. Fast Refresh state retention across source edits is not a
contract; ordinary rerenders retain identity.

The generated marker comment makes a second transform pass a no-op. Keep the
marker on transformed source. After JSX lowering, the component detection rule
also prevents another pass from adding wrappers.

### No-ref semantics

A non-null object or callback ref is added as an own enumerable `ref` prop using
`{ ...props, ref }`. Other props are not mutated. Ref replacement and unmount
cleanup remain React's responsibility.

React 18 supplies `null` to `forwardRef` for an absent ref, `ref={undefined}`, and
`ref={null}`. The transform **passes props through unchanged when this callback
argument is nullish**. It does not insert `ref: null` in this case. Thus, on React
18 all three cases become an absent prop. Destructuring defaults such as
`{ ref = fallback }` run in all three cases. The original distinction between
explicit null and an absent/undefined ref cannot be recovered on React 18.
Adapted React 19 output uses the same normalization; disabled React 19 output
keeps native ref-prop semantics.

Callback refs that return cleanup functions are a separate React 19 feature and
are not polyfilled. Use callbacks that return nothing for React 18 compatibility.

### Dependencies and supported versions

- Node: `^24.18.0 || >=26.0.0`; development and CI use Node 24.20.0.
- Rolldown: 1.2.7 or later 1.x.
- Vite: 8.2.2 or later 8.x, including Vitest 5's transform pipeline.
- React/React DOM: 18.3.1 for the compatibility target. Tests also cover 19.3.0
  and the pinned Ariakit integration's React 19.2.8.

The plugin's runtime dependencies are external: `oxc-parser`, `magic-string`, and
`@rollup/pluginutils`. React is only a development dependency of this repository.
The published plugin neither installs nor bundles React. Generated code imports
`react` from the consumer's dependency graph. Configure React as external when
building a reusable component library.

## Development and integration evidence

```sh
pnpm install --frozen-lockfile
pnpm run check
```

The checks include syntax fixtures, separate React runtime graphs, real Rolldown
and Vite transforms, source maps, TypeScript output, and a tarball installed in a
separate consumer. See [Contributing.md](./Contributing.md).

The pinned Ariakit gallery has a failing React 18 baseline and passes with only
UI source files selected. React 19 coverage remains enabled. See the
[reproduction and results](./docs/ariakit-integration.md). Changes to Ariakit are
kept separate from this package.

## Release status and license

The repository remains private. Keep `RELEASE_ENABLED=false` and
`NPM_PUBLISH_ENABLED=false` until publication timing, package contents, the MIT
license, and npm trusted publishing are confirmed. The npm name is not reserved
by this implementation.

[MIT](./LICENSE).
