# nirs4all-web · studio-lite

A **single-page, full-WASM "mini nirs4all-studio"** — a public demonstrator that runs the whole
NIRS modelling loop **in the browser, no Python**: upload spectra → explore & configure the dataset
→ build/choose a simple pipeline from **nirs4all-methods** nodes → **run it** → inspect scores
(refit / CV / folds) → see residual/parity views → **predict on new spectra**. Everything runs
locally; nothing is uploaded.

> Part of the [nirs4all](https://nirs4all.org) ecosystem. This is the standalone browser/WASM
> client, not new numerical code: the
> numerics live upstream in `nirs4all-methods` (libn4m) and are orchestrated by `dag-ml`.

## Run it

```bash
npm install
npm run dev            # dev server
npm run build          # static site → dist/ (primary, lazy-loaded WASM)
npm run build:single   # single offline HTML → dist-single/index.html (opens via file://)
npm run test           # vitest: engine numerics + data assembly
npm run typecheck      # tsc --noEmit
npm run validate:catalog   # fail if a node claims a non-exported libn4m ABI symbol
```

Runtime browser smoke (uses a local Chromium): `node tests/smoke.mjs` (set `SMOKE_URL` /
`CHROME`). Both the served build and the `file://` single-file build pass it.

## Architecture — the full nirs4all WASM stack

```
 upload → nirs4all-formats WASM (decode ~58 formats) → nirs4all-io WASM (infer + DatasetSpec)
        → MaterializedDataset
 pipeline (catalog) → dag-ml WASM compiles the DSL → GraphSpec, then its SequentialScheduler
        EXECUTES the cross-validation in-browser: per (node, fold) it invokes a JS controller that
        runs preprocessing + PLS/PLS-DA via libn4m WASM; dag-ml owns the fold loop, OOF assembly
        (by sampleId) and lineage. Refit (full-train) is fit directly with libn4m.
        → RunResult (refit/CV/folds + predictions + dag-ml lineage) → results / residuals / predict
```

Four real WASM engines participate: **formats** (decode), **io** (inference), **dag-ml** (the
coordinator — compiles *and executes* the cross-validation), **libn4m** (the PLS numerics).

- **Engine contract** (`src/engine/types.ts`): one `Engine` interface (`run`, `predict`) with a
  pluggable `ModelBackend` (`orchestrate.ts`). On the served build `MainEngine` → `DagMlEngine`:
  dag-ml-wasm's `execute_campaign_phase_json` runs FIT_CV, calling a synchronous JS controller per
  fold that resolves the fold's samples (via `task.fold_id` + the host `FoldSet`) and runs the
  pipeline through the **libn4m** backend (real C++ PLS, WASM). `DagMlEngine` falls back to direct
  libn4m orchestration on any error, and offline (`file://`) the engine uses the pure-JS NIPALS
  backend. Orchestration is leakage-honest (preprocessing fit-on-train, OOF-by-`sampleId`) and
  refuses to train without targets. The Rust execution binding lives in
  `dag-ml/crates/dag-ml-wasm` (`execute_campaign_phase_json` + a `JsRuntimeController`).
- **Node catalog** (`src/catalog/`): one entry per *exported* nirs4all-methods operator, carrying the
  real libn4m ABI symbols. `npm run validate:catalog` fails CI if any symbol isn't exported upstream
  (e.g. OPLS is intentionally excluded). **Adding a method = add one catalog entry** (+ a dispatch
  case if it needs new numerics). The preset gallery is authored over these entries.
- **Data** (`src/data/`): two ingestion paths behind one `MaterializedDataset` shape — an
  axis-aware **CSV** builder (`X_train/y_train(+_test,+metadata)` convention, wavelength-header and
  task-type inference), and the real **nirs4all-formats + nirs4all-io WASM** stack (`wasm-io.ts`,
  loaded on demand) that decodes ~58 vendor formats, runs `inferDataset`, surfaces the inference
  evidence + reader catalog + schema-validated `DatasetSpec` in the config dialog, and materializes
  X/y. Three bundled demos (Fruit purée regression, NIR protein regression & 7-class). Targetless
  uploads are allowed for explore/predict; the engine refuses to *train* without targets.

## Roadmap

**Done:** dag-ml's `SequentialScheduler` now *executes* the cross-validation in-browser (the
`execute_campaign_phase_json` export added in `dag-ml/crates/dag-ml-wasm`), driving libn4m per fold.
Remaining deepening:

- Run **REFIT + PREDICT** phases through dag-ml too (today the refit/full-train model is fit directly
  with libn4m; CV is the dag-ml-executed part). This needs dag-ml's `InMemoryArtifactStore` +
  artifact-emitting controller across phases.
- Use a real **`dag-ml-data-wasm` `WasmInMemoryProvider`** + `data_bindings` so transform nodes pass
  data through dag-ml handles (today the single model node carries preprocessing internally — valid
  per "operators are external", but multi-node data flow needs the provider).
- Land the `dag-ml-wasm` execution export upstream as a PR (full `cargo test --workspace` +
  `validate_contracts.py` green gate; this repo ran fmt + clippy on the change).

Also: a fully editable `DatasetSpec` form (today: inferred spec + evidence + live schema validation +
target/task/split edits); offline webfont vendoring; continued visual polish.

## Verification

`npm run typecheck` · `npm run test` (10 unit tests: PLS engine, materializer, CSV builder) ·
`npm run validate:catalog`. Browser smokes (need a local Chromium via `CHROME=…`): `tests/smoke.mjs`
(regression load→run→results→predict), `tests/classification-smoke.mjs` (PLS-DA → confusion),
`tests/wasm-upload-smoke.mjs` (vendor SPC decode). All pass on both the served build and the
`file://` single-file build.
