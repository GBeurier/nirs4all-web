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
| `dataset` | `nirs4all-ui/dataset` | Dataset preview contracts, counts, split summaries, spectral ranges, task labels, badges, and stats. |
| `components` | `nirs4all-ui/components` | Stateless React components that render shared runtime, diagnostic, and metric affordances. |

The root export also exposes namespace barrels:

```ts
import { dataset, runtime, score } from "nirs4all-ui";
```

Prefer domain imports when a consumer only needs one area:

```ts
import { canonicalMetricKey, formatMetricValue } from "nirs4all-ui/score";
import { buildDatasetPreview } from "nirs4all-ui/dataset";
import { buildRuntimeResultStatusView } from "nirs4all-ui/runtime";
import { MetricValueBadge, RuntimeEngineBadge } from "nirs4all-ui/components";
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
Pages publication files (`logo.svg`, `favicon.ico`, `favicon.svg`,
`robots.txt`, `sitemap.xml`, and `site.webmanifest`). The site build also
copies the package brand kit to namespaced GitHub Pages URLs under
`assets/brand/nirs4all-ui/`;
the npm package keeps the same files available under `assets/brand` through the
`nirs4all-ui/assets/*` export. The default Pages base is `/nirs4all-ui/` for
the GitHub project-page path; set
`NIRS4ALL_UI_BASE=/` and add a `CNAME` only when switching to a dedicated
subdomain such as `ui.nirs4all.org`.

`site/src/App.test.tsx` is the focused hardening check for the showcase: it
verifies that every public React component export appears in the page and that
the mirrored brand/logo, crawler metadata, manifest, and canonical URLs stay in
sync with the packaged asset set.
