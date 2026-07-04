# nirs4all-ui

Shared React UI components and pure TypeScript view-model helpers used by
nirs4all Studio and the standalone web/WASM client.

This package intentionally keeps components presentational and keeps the
framework-free helpers free of hooks, API clients, filesystem access, browser
globals, or backend/runtime execution. Hosts own app state, routing, data
fetching, and icons; this package owns shared display contracts and reusable
UI surfaces.

## Domains

| Domain | Export | What it owns |
| --- | --- | --- |
| `score` | `nirs4all-ui/score` | Metric-key normalization, metric catalog helpers, direction-aware score parsing, comparison, and formatting. |
| `runtime` | `nirs4all-ui/runtime` | Runtime/result status display tokens, busy-state predicates, progress projection, engine metadata summaries, diagnostics, and native-result affordances. |
| `components` | `nirs4all-ui/components` | Stateless React components that render shared runtime and result UI affordances. |

The root export also exposes namespace barrels:

```ts
import { runtime, score } from "nirs4all-ui";
```

Prefer domain imports when a consumer only needs one area:

```ts
import { canonicalMetricKey, formatMetricValue } from "nirs4all-ui/score";
import { buildRuntimeResultStatusView } from "nirs4all-ui/runtime";
import { RuntimeEngineBadge } from "nirs4all-ui/components";
```

## Development

```bash
npm install
npm run typecheck
npm test
```

`npm run build` emits ESM JavaScript and declaration files under `dist/`.

## GitHub Pages showcase

The single-page component and helper catalogue lives under `site/`.

```bash
npm run site:dev
npm run site:build
```

`site/src/App.tsx` renders reusable React components separately from the
runtime and score helper inventories. `site/public/` intentionally carries the
Pages publication files (`logo.svg`, `favicon.svg`, `robots.txt`,
`sitemap.xml`, and `site.webmanifest`), while the package brand kit remains
available through `assets/brand` and the `nirs4all-ui/assets/*` export.
