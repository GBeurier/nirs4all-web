<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/horizontal-dark.svg">
    <img alt="nirs4all-web" src="assets/brand/horizontal.svg" width="440">
  </picture>
</p>

# nirs4all-web

Standalone browser client for the **nirs4all** ecosystem.

`nirs4all-web` is the public, backend-free WASM application: upload spectra, inspect and configure
the inferred dataset, build a compact NIRS pipeline, run portable PLS pipelines through the
vendored `nirs4all` aggregate or broader cross-validated workflows through `dag-ml` + `libn4m`,
inspect results, predict on new spectra, and export a reusable `.n4a` bundle.
All data stays in the browser.

Part of the [open-source NIRS tools](https://nirs4all.org/open-source-nirs-tools.html)
ecosystem: file readers, datasets, methods, browser modelling, reproducible pipelines,
papers, benchmarks, and release dashboards for near-infrared spectroscopy.

The canonical multi-language aggregate target is `nirs4all-core`; this repository is only the
client-side Web/WASM product surface and does not publish aggregate bindings or release-factory
artifacts.

## What Lives Here

- `web-app/`: current source directory for the nirs4all-web React/Vite app and GitHub Pages deliverable.
- `.github/workflows/deploy-pages.yml`: builds the nirs4all-web app from `web-app/` and publishes the static app.
- staged WASM packages under `web-app/src/engine/wasm/`, consumed from upstream sibling repos.
- `web-app/vendor/nirs4all/`: vendored `nirs4all-core` JavaScript/WASM aggregate used by the
  browser runtime and checked for drift with `npm run check:core-shim`.

There is no Python backend and no new numerical implementation here. Parser, dataset, DAG, and
chemometric fixes belong upstream in `nirs4all-formats`, `nirs4all-io`, `dag-ml`,
`dag-ml-data`, or `nirs4all-methods`.

## Run

```bash
cd web-app
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$HOME/.cargo/bin:$PATH"
npm install
npm run dev
```

Main checks:

```bash
npm run typecheck
npm run test
npm run test:strict-profile
npm run validate:catalog
npm run build
npm run build:single
npm run smoke:rt-fallback:strict
npm run smoke:rt-fallback:transitional
```

`npm run build` is the deployed `strict-wasm` product profile: native/WASM
execution is required and JavaScript, provider-to-matrix, scheduler, and remote
compute fallbacks fail closed. Development/test and `build:single` remain the
explicit transitional compatibility profile; `npm run build:transitional`
produces that served profile for migration diagnostics.

The two `rt-fallback` browser gates build and serve distinct output directories.
The strict gate proves that `allowFallback:true` is rejected; the transitional
gate proves the historical, diagnosed scheduler fallback remains available.

Browser smokes need a local Chromium:

```bash
export CHROME=${CHROME:-/usr/bin/google-chrome}
npm run build
npm run smoke -- rt-fallback
```

The full `npm run smoke` inventory is broader than WEB-001. In particular,
`converted-predictions-render` and `performance-compare` require generated
cross-runtime artifacts, while `repository-best-pipeline` requires its Python
handoff/oracle. Dataset smokes may additionally use `SPC_DIR` or `AMYLOSE_DIR`.
Those prerequisite-bearing gates are reported separately; they are not skipped
or treated as evidence for the two self-contained profile smokes above.

## Deployment

GitHub Pages publishes at:

```text
https://web.nirs4all.org/
```

The canonical browser entry point is linked from `nirs4all.org`.

## License

`nirs4all-web` is dual-licensed open-source — **`CeCILL-2.1 OR AGPL-3.0-or-later`** (your choice) —
with an optional **commercial license** for closed-source / SaaS use. For any commercial use, contact
<nirs4all-admin@cirad.fr>. See [`LICENSING.md`](LICENSING.md), the texts under [`LICENSES/`](LICENSES/),
and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The re-exported native libraries it consumes
carry their own licenses (see each project).
