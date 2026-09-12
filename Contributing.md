# Contributing

## Set up the project

Install the pnpm version in `package.json`. pnpm downloads the Node version in
`devEngines.runtime` when you install dependencies and uses it for project
commands. The resolved runtime is recorded in `pnpm-lock.yaml`.
Development dependencies use exact versions. `engines.node` defines the supported
Node versions for consumers.

```sh
pnpm install --frozen-lockfile
pnpm run check
```

## Commands

| Command                 | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `pnpm run lint`         | Run Oxlint.                                  |
| `pnpm run lint:fix`     | Apply Oxlint fixes.                          |
| `pnpm run format`       | Run Oxfmt.                                   |
| `pnpm run format:check` | Check source formatting.                     |
| `pnpm run fix`          | Run lint fixes, then formatting.             |
| `pnpm run typecheck`    | Check source, test, and configuration types. |
| `pnpm test`             | Build and run Vitest tests.                  |
| `pnpm run build`        | Emit JavaScript and declarations in `dist`.  |
| `pnpm run changeset`    | Add a release note for a user-facing change. |

## Source and tests

`src/index.ts` is the public plugin entry point. `src/transform.ts` selects
components with Oxc and applies source edits with MagicString. Issue #1 defines
the plugin scope and acceptance criteria.

Rolldown builds the public entry point and TypeScript declarations. TypeScript
checks source, tests, and tool configuration. Vitest is configured for
`tests/*.test.ts`, with separate React 18 and React 19 projects. The private
fixture workspaces install matching React and React DOM versions.

Test ref behavior under React 18 and React 19, plus real Rolldown and Vite/Vitest
integration. Verify the packed package and its declarations from a consumer
project. Keep source fixtures in `tests/fixtures`; this directory is excluded
from formatting, lint, and TypeScript project checks.

Changesets uses its built-in changelog generator. Add a changeset for each
user-facing change. The root package is explicitly listed in
`pnpm-workspace.yaml` so Changesets can version and publish it. The React fixture
workspaces are private and are not published.

## Releases

Version `0.1.0` is prepared for the first npm publication. Before publishing,
merge the production dependency ranges and release preparation changes, then
run the checks and inspect the publish plan:

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm exec changeset publish-plan
```

The plan must contain only `rolldown-plugin-react-forward-ref` at the intended
version. Authenticate to npm and run `pnpm run release` from the merged `main`
branch to publish the first version locally. Push the release tag after a
successful publication. After the
package exists, configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
with GitHub owner `diegohaz`, repository `rolldown-plugin-react-forward-ref`, and
workflow filename `release.yml`. Permit direct `npm publish` for this workflow.
The repository is private, so `publishConfig.provenance` is `false`.

`RELEASE_ENABLED` enables the Changesets workflow. `NPM_PUBLISH_ENABLED` also
enables its publish step. Keep both variables `false` until the first publication
and trusted publisher setup are complete. Later releases use version PRs created
by the workflow.

## Commit checks

Lefthook runs staged-file Oxlint fixes, then Oxfmt, in order. Each successful
step stages its fixes. `allowBuilds.lefthook: true` permits the installation
script. If a cached install does not create the hook, run:

```sh
pnpm exec lefthook install
```

The `Main` workflow in `.github/workflows/main.yml` runs lint, formatting,
typecheck, and build/tests as separate steps on the pinned Node version. A
separate `Gate` job requires the checks to pass. The release workflow uses the
same setup and dispatches `Main` for version PRs. Run `pnpm run check` before
you submit a change. The package test packs the build and installs it
into a temporary consumer. It uses the pnpm cache and can fetch missing registry
metadata.
