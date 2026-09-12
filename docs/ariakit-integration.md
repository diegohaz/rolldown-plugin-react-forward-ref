# Ariakit React 18 integration

Verified on 2026-09-12 against the issue's pinned Ariakit commit:
[`afb328bfa4d78b5359a8623969c2c3e204b73763`](https://github.com/ariakit/ariakit/tree/afb328bfa4d78b5359a8623969c2c3e204b73763).
The package contains no Ariakit dependency or Ariakit-specific selection default.
This document and the opt-in reproduction script record the consumer integration.

## Reproduce

Install this package's development dependencies, then run:

```sh
pnpm run test:ariakit
```

To avoid downloading the Git repository, supply an existing local Ariakit clone
that contains the pinned commit:

```sh
pnpm run test:ariakit -- /path/to/ariakit
```

The script builds the plugin, clones Ariakit into a new temporary directory, and
checks out the pinned commit. It uses that commit's pnpm and Node versions. It
installs dependencies, removes the React 18 test skip in the disposable checkout,
and requires the unadapted React 18 run to fail with the ref warning. It then adds
the plugin to the React project's configuration and runs both targets. It saves
logs and the integration diff in the temporary directory printed at startup.
It does not edit the supplied clone or push Ariakit changes.

## Result

The test is
[`preserves the selected avatar color when its kind changes`](https://github.com/ariakit/ariakit/blob/afb328bfa4d78b5359a8623969c2c3e204b73763/app/src/sandbox/ariakit-ui-button/test.ts).
It changes the avatar color, toggles its kind twice, and checks that the selected
color remains. The existing test setup renders in StrictMode.

| Configuration                                            | Result                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| React/React DOM 18.3.1, skip removed, no transform       | 1 failed; React reports that ordinary function components cannot receive refs. Ariakit's console check fails on `ButtonGroup` and `Button`. |
| React/React DOM 18.3.1, skip removed, transform enabled  | 1 passed, with the existing color-preservation assertions and console checks.                                                               |
| React/React DOM 19.2.8, skip removed, transform disabled | 1 passed.                                                                                                                                   |

These runs use Ariakit's actual `pnpm test-react18` command. It copies the source
into an isolated workspace and rewrites the React dependency graph to React 18.
The commands are:

```sh
pnpm test-react18 app/src/sandbox/ariakit-ui-button/test.ts
pnpm test app/src/sandbox/ariakit-ui-button/test.ts
```

The baseline proves the React 18 test fails on ref transport. It does not claim
that the color assertion itself fails before adaptation. The package's DOM tests
also assert object refs, callback refs, ref replacement, unmount cleanup, and
child identity across state changes.

## Separate Ariakit change

The consumer configuration adds the plugin before `reactPlugin()` in the React
project of `vitest.config.ts`:

```ts
import { version } from "react";
import reactForwardRef from "rolldown-plugin-react-forward-ref";

// In the React project's configuration:
plugins: [
  version.startsWith("18.") &&
    reactForwardRef({
      include: ["**/packages/ariakit-ui/src/components/*.react.tsx"],
    }),
  reactPlugin(),
];
```

Only UI component files are selected. No example wrapper was required for this
gallery. `packages/ariakit-react*/**` is outside the include filter, so the
underlying library keeps its original React 18 implementation. The reproduction
script uses an absolute import of the local plugin build because this package is
not yet published. The generated component code still imports React from
Ariakit's dependency graph.

Once a package version is available to Ariakit, add it to Ariakit's root
`devDependencies`, apply the configuration above, and replace the gallery's
`test.skipIf(version.startsWith("18."))` with `test`. Remove the obsolete comment
and unused version import from the test. Submit that change separately from this
package's implementation. The skip remains in Ariakit's real checkout until that
integration change is accepted.
