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

The `Release` workflow in `.github/workflows/release.yml` uses `changesets/action` to create version PRs and publish packages on pushes to `main`. You can also dispatch it manually on `main`.

1. Run `pnpm run changeset` for a user-facing change and commit the generated release note with the change.
2. Merge the change into `main`. The action runs `pnpm run version` to update the version and changelog in a separate `Publish` PR. It also dispatches `Main` checks for that PR.
3. Review the version and changelog, wait for the checks to pass, then merge the `Publish` PR. The action runs `pnpm run release` to publish to npm and creates the release tag and GitHub release.

Both repository variables, `RELEASE_ENABLED` and `NPM_PUBLISH_ENABLED`, are set to `true`. Set `RELEASE_ENABLED=false` to pause the entire release job. Set `NPM_PUBLISH_ENABLED=false` to pause npm publication while keeping version PRs enabled.

[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) is configured for GitHub owner `diegohaz`, repository `rolldown-plugin-react-forward-ref`, and workflow filename `release.yml`, with direct publication permitted. The workflow uses GitHub Actions OIDC authentication; no npm access token is required. The repository is private, so `publishConfig.provenance` is `false`.

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
