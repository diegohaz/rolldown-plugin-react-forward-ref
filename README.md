# rolldown-plugin-react-forward-ref

Transform React ref props into `React.forwardRef` components for React 18 with
Rolldown and Vite.

This repository contains the project setup. The plugin is not implemented or
published yet. See [issue #1](https://github.com/diegohaz/rolldown-plugin-react-forward-ref/issues/1)
for the implementation brief and acceptance criteria.

## Intended use

Run React 19-style function components in a React 18 test environment by adding
a source transform as a Vite or Rolldown plugin. The first use case is Ariakit's
React 18 test suite, including components that forward refs through prop spreads
and helper functions.

The plugin will adapt ref transport. Other React 19 features need separate
compatibility work. The public API will be defined during implementation.

## Development

```sh
pnpm install --frozen-lockfile
pnpm run check
```

The project uses TypeScript, pnpm, Rolldown, Vitest, Oxlint, Oxfmt, Changesets,
and Lefthook. See [Contributing.md](./Contributing.md) for the workflow.

Project configuration is based on
[oxlint-plugin-comment-reflow](https://github.com/diegohaz/oxlint-plugin-comment-reflow/tree/79465bf06f8750222b3a7842f4447ab710361126).

## Release status

The repository starts private. `RELEASE_ENABLED` and `NPM_PUBLISH_ENABLED` are
`false` during setup. Configure npm publishing and complete the implementation
before enabling releases. The package name is not reserved on npm.

## License

[MIT](./LICENSE).
