# nirs4all Custom App Host Example

This is a minimal client-side-only host that composes:

- `nirs4all` for the browser/WASM aggregate runtime surface.
- `nirs4all-ui` for reusable React components, pure view-model helpers, and brand assets.

It is intentionally separate from the `studio-lite` app shell. The example does not import `@/engine/*`, app routing, state stores, or Studio/Web component internals.

## Run Locally

From this directory:

```bash
npm install
npm run typecheck
npm test
npm run build
```

The package uses file dependencies against `../../vendor/nirs4all` and `../../vendor/nirs4all-ui` so it can be tested against the same vendored release candidate as `web.nirs4all.org`.

## Host Boundary

The host owns:

- routing and app state
- local data loading policy
- icon components and CSS classes
- runtime execution policy

The reusable packages own:

- capability and runtime contracts from `nirs4all`
- portable pipeline execution entrypoints
- dataset/runtime/score view-models from `nirs4all-ui`
- presentational React components from `nirs4all-ui/components`
