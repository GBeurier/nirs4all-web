# nirs4all-web

Standalone browser client for the **nirs4all** ecosystem.

`nirs4all-web` is the public, backend-free WASM application: upload spectra, inspect and configure
the inferred dataset, build a compact NIRS pipeline, run portable PLS pipelines through the
vendored `nirs4all` aggregate or broader cross-validated workflows through `dag-ml` + `libn4m`,
inspect results, predict on new spectra, and export a reusable `.n4a` bundle.
All data stays in the browser.

This repository used to be named `nirs4all-lite`. The name is being freed for the canonical
multi-language aggregate distribution of the low-level stack.

## What Lives Here

- `studio-lite/`: active React/Vite app and the GitHub Pages deliverable.
- `.github/workflows/deploy-pages.yml`: builds `studio-lite/` and publishes the static app.
- staged WASM packages under `studio-lite/src/engine/wasm/`, consumed from upstream sibling repos.
- `studio-lite/vendor/nirs4all/`: vendored `nirs4all-lite` JavaScript/WASM aggregate used by the
  browser runtime and checked for drift with `npm run check:lite-shim`.

There is no Python backend and no new numerical implementation here. Parser, dataset, DAG, and
chemometric fixes belong upstream in `nirs4all-formats`, `nirs4all-io`, `dag-ml`,
`dag-ml-data`, or `nirs4all-methods`.

## Run

```bash
cd studio-lite
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$HOME/.cargo/bin:$PATH"
npm install
npm run dev
```

Main checks:

```bash
npm run typecheck
npm run test
npm run validate:catalog
npm run build
npm run build:single
```

Browser smokes need a local Chromium:

```bash
export CHROME=${CHROME:-/usr/bin/google-chrome}
nohup npm run preview -- --port 4345 --strictPort >/tmp/n4a-web-preview.log 2>&1 & sleep 4
for t in tests/*smoke.mjs; do SMOKE_URL="http://localhost:4345/" node "$t" || break; done
pkill -f "vite preview"
```

## Deployment

After the GitHub repository rename, GitHub Pages should publish at:

```text
https://gbeurier.github.io/nirs4all-web/
```

The long-term canonical entry point should be linked from `nirs4all.org`.
