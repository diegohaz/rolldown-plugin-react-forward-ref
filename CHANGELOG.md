# rolldown-plugin-react-forward-ref

## 0.2.1

### Patch Changes

- 67c49bc: Add a transform hook filter so Rolldown and Vite skip handler calls for unsupported files, declarations, dependencies, virtual modules, and raw or URL requests.

## 0.2.0

### Minor Changes

- 948f145: Add `elementFactories` to allow ref adaptation for components passed to trusted element helpers. Strings match a local helper name at argument 0. Import descriptors match an exact source and export name, with an optional `argumentIndex`. Direct calls, constructors, other arguments, and unknown helpers still prevent adaptation.

## 0.1.0

### Minor Changes

- c6727c9: Add a source transform that runs selected React ref-prop components on React 18
  through module-level `forwardRef` wrappers. Support Rolldown, Vite, and Vitest,
  with explicit file filters, TypeScript/JSX component detection, indirect prop
  forwarding, stable component identity, and source maps.
