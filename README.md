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

Archive V2 prediction is likewise upstream-owned. Web passes the stored ZIP to
Core's Rust/WASM validator and executes its single Methods predictor through
Methods WASM. N4MM format 1 carries raw PLS; format 2 carries the exact embedded
`SNV(ddof=0) -> Savitzky-Golay(mode=interp) -> PLS` pipeline and receives raw
features from Web. Both paths preserve named multi-target output and have no
JavaScript/Python model or preprocessing fallback. Calibrated/conformal Archive
V2 packages are not a Web execution surface yet; conformal fields remain
metadata-only rather than a locally minted guarantee.

## Native browser REFIT and grouped validation

The DAG browser engine uses `execute_initial_full_refit_json` for a concrete
selected pipeline and `replay_initial_full_refit_json` for its predictions.
The original package JSON is retained verbatim, including exact native u64
seeds. The browser controller fits the existing Methods/ML backend only inside
the native REFIT task; PREDICT only replays fitted state. Its package explicitly
uses a browser composite host sidecar, with pipeline/class-column vocabulary
bound in native parameters and the learned carrier SHA-256 and byte length
bound in the native artifact reference. It is not a RAW
portable estimator package. Export applies the existing training-row consent
policy and preserves the native package. Native checkpoint serialization
normalizes consent flags for the binding check; exports cannot reseal changed
learned state. Legacy imported `.n4a` models and the
portable Core subset retain their explicit existing replay profiles.

Metadata CSV roles `group_id`, `origin_id`, `repetition_id`, and `augmented` are
preserved as identities, rather than numeric features. Leading zeros in group
IDs survive CSV import. `origin_id` refers to an existing `sample_id` and requires
an explicitly augmented row; no repetition is fabricated when undeclared.
CV defaults to native GroupKFold when groups are declared. Its requested group
count is never clipped, and absent/incomplete groups or native exports are
refused. A group may not cross an explicit Train/Test partition. Upload a
suitable partition instead of applying a row-wise split to grouped data.
Declared groups must cover every Train/Test row, including REFIT-only runs.
Augmented observations remain eligible for fitting on their native group folds,
but never enter validation, OOF or Train/Test scores. The native fold contract
uses its partial-validation (`resampled`) mode for these training-only IDs;
each original observation is still validated exactly once. Each fold and each
scoring cohort must contain an original observation.

The existing preprocessing/feature-branch CV path still executes the browser
operator chain on native folds; its lineage distinguishes that host CV from the
native model-only scheduler. REFIT/PREDICT use the native package in both cases.
This change does not introduce multi-source source-selection UI or an Archive
V2 multi-source writer (WEB-03), nor a Python/browser server bridge.

The current checked-in WASM remains historical until final qualification.
Rebuild DAG WASM from the final reviewed sources (including the thin native
GroupKFold export), stage its generated JS/d.ts and real artifact checksums,
and update the existing staging/verifier source pins from actual proofs. Old
DAG 0.3.23 binaries cannot satisfy these new mandatory exports. Run native
`dagml-refit.native.test.ts`, the complete Web tests/typecheck/build and browser
roundtrip/profile smokes only after that staging. Missing exports fail closed;
there is no direct numerical REFIT fallback.

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

The model catalog gate runs every offered estimator with its default parameters
on Corn (regression) and Meat (multiclass), checking CV/refit scores and prediction
on held-out spectra. It uses model-only pipelines to exercise the WASM scheduler
and its one-hot class-score contract. Run the four bundled datasets with:

```bash
MODEL_SAMPLES=corn,beer,meat,anopheles MODEL_TIMEOUT_MS=600000 MODEL_REPORT=/tmp/web-models.json npm run smoke -- models-smoke.mjs
```

Set `MODEL_PREPROCESSING=preset` to retain each sample's initial preprocessing,
or `MODEL_NAMES='ECR,Ridge PLS'` to check specific picker entries. POP-PLS runs
nested operator selection and can exceed the default three-minute per-model
test timeout on the wider examples; its worker remains cancellable.
See [the model audit](MODEL_AUDIT.md) for reproduced failures and validation scope.

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
