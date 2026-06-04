# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`nirs4all-studio-lite` is a single-page, **full-WASM public demonstrator** — a "mini nirs4all-studio"
that runs the whole NIRS modelling loop in the browser with **no Python and no backend**: upload
spectra → explore + configure the dataset → build/choose a simple pipeline from nirs4all-methods
nodes → run it → inspect scores (refit / CV / folds) → residual / parity / confusion views → predict
on new spectra → export. It lives inside the `nirs4all-lite` distribution repo (the "online demos"
target) and consumes the upstream ecosystem libraries **as prebuilt/staged WASM** — it never
reimplements NIRS, IO, or numerical logic. See `README.md` for the user-facing overview.

## Toolchain (IMPORTANT: not on the default PATH)

Node (nvm), cargo, wasm-pack and emcc are installed but **not** on the non-interactive PATH. Prefix
build/test commands with:

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$HOME/.cargo/bin:$PATH"
# for rebuilding WASM from source also: source "$HOME/emsdk/emsdk_env.sh"
```

The plain `node`/`npm` first on PATH are the **Windows** ones under `/mnt/c` — do not use them.

## Commands

```bash
npm install
npm run dev             # Vite dev server
npm run build           # served static site → dist/  (WASM lazy-loaded; primary deliverable)
npm run build:single    # single offline HTML → dist-single/index.html (file://; ALL wasm inlined, ~17 MB)
npm run typecheck       # tsc --noEmit — part of the green gate; `vite build` does NOT typecheck
npm run test            # vitest (node env) — engine numerics, materializer, CSV builder
npm run validate:catalog# fail if any node claims a libn4m ABI symbol that isn't exported upstream
npm run wasm            # scripts/build-wasm.sh — rebuild & stage all WASM (formats, io, methods, dag-ml)

# single test file
npx vitest run --config vitest.config.ts src/engine/engine.test.ts
```

Browser smokes (real Chromium; these are the end-to-end verification, run them before declaring work done):

```bash
export CHROME=/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome
nohup npm run preview -- --port 4345 --strictPort >/tmp/prev.log 2>&1 & sleep 4
SMOKE_URL="http://localhost:4345/" node tests/smoke.mjs               # load→run→results→predict (+ dag-ml & libn4m)
SMOKE_URL="http://localhost:4345/" node tests/classification-smoke.mjs# PLS-DA → confusion
SMOKE_URL="http://localhost:4345/" node tests/wasm-upload-smoke.mjs   # vendor SPC decode (uses ../../nirs4all-formats/samples)
pkill -f "vite preview"
SMOKE_URL="file://$PWD/dist-single/index.html" node tests/smoke.mjs   # offline single-file (JS-backend fallback)
```

**Green gate** = typecheck + test + validate:catalog + build + build:single + the 4 smokes all pass
with no console errors.

## Architecture — the full nirs4all WASM stack

Data and compute flow through four real WASM engines (staged under `src/engine/wasm/<name>/`), all
in the browser:

```
upload → nirs4all-formats WASM (decode ~58 vendor formats)         [src/data/wasm-io.ts]
       → nirs4all-io WASM (inferDataset + DatasetSpec validation)  [src/data/wasm-io.ts]
       → MaterializedDataset
pipeline DSL → dag-ml WASM (compile + validate → canonical GraphSpec) [src/engine/dagml.ts]
       → Engine.run(): preprocessing(fit-on-train) → K-fold → OOF(by sampleId) → refit → predict
                        PLS / PLS-DA numerics by libn4m WASM        [src/engine/backends.ts]
       → RunResult (refit/CV/folds + predictions + dag-ml lineage)
```

Load-bearing concepts (require reading several files):

- **The `Engine` contract is the keystone.** `src/engine/types.ts` defines `Engine` (`run`,
  `predict`) plus `MaterializedDataset`, `PipelineDSL`, `RunResult`, etc. Everything — UI, data,
  catalog — is written against these types, and `src/components/contracts.ts` defines the prop
  interface for every feature component. Change a shape here and you change the whole app; keep these
  two files authoritative.

- **Pluggable model backend, one orchestration.** `src/engine/orchestrate.ts` holds the *single*
  leakage-honest pipeline runner (preprocessing fit on the train fold only; OOF joined by
  `sampleId`, never row order; test partition held out of CV; refuses to train without targets),
  parameterized by a `ModelBackend`. `src/engine/backends.ts` provides two: `jsBackend` (NIPALS in
  `algo/pls.ts`) and the real `libn4m` backend (`@nirs4all/methods-wasm`, C++→WASM, staged in
  `src/engine/wasm/methods/`). `MainEngine` (`src/engine/main-engine.ts`, the app's engine via
  `client.ts`) runs on the **main thread**, prefers libn4m, and **falls back to the JS backend under
  `file://`** (the single-file build can't fetch the emscripten `n4m.wasm`). `StubEngine` =
  JS-backend engine kept for unit tests / fallback.

- **Two data paths, one `MaterializedDataset`.** `src/data/dataset.ts` is the axis-aware **CSV**
  builder (the `X_train/y_train(+_test,+metadata)` convention; a numeric *first row* is the
  wavelength axis only when its magnitudes are axis-scale, i.e. `max|v|>50`). `src/data/wasm-io.ts`
  is the **vendor-format** path (formats decode → io infer → `materialize()`); CSV uploads use the
  builder, non-CSV use wasm-io. Both yield the same shape; target-less datasets are allowed (explore/
  predict), and the *engine* refuses to train without targets. `src/data/samples.ts` bundles three
  real demos (Fruit-purée regression, NIR-protein regression & 7-class) via `?raw` so they work
  offline.

- **The node catalog is the single source of truth for methods, gated against the real ABI.**
  `src/catalog/nodes.ts` has one entry per *exported* libn4m operator, carrying the actual ABI
  symbols. `scripts/validate-catalog.mjs` (CI gate) fails if a symbol isn't in
  `../../nirs4all-methods/cpp/abi/expected_symbols_*.txt` — this is why **OPLS is intentionally
  absent** (its enum exists but no symbol is exported). The engine dispatches on the node `type`
  token; preprocessing lives in `src/engine/algo/preprocessing.ts`. **Adding a method = add one
  catalog entry** (+ a dispatch case only if it needs new numerics). Presets/builder live in
  `src/catalog/presets.ts` + `src/components/pipeline/`.

- **dag-ml EXECUTES the cross-validation (not just plans it).** `src/engine/dagml-engine.ts`
  (`DagMlEngine`, the served-build engine) compiles the pipeline DSL → GraphSpec, builds a `FoldSet`
  from the CV folds, and calls **`dag-ml-wasm`'s `execute_campaign_phase_json`** (a new export I
  added in `dag-ml/crates/dag-ml-wasm/src/lib.rs`) to run FIT_CV through dag-ml's real
  `SequentialScheduler` in WASM. Per (node, fold) the scheduler invokes a **synchronous JS
  controller** (`JsRuntimeController` on the Rust side) that resolves the fold's samples via
  `task.fold_id` + the host `FoldSet` and runs preprocessing + PLS through libn4m; it must echo
  `task.seed` **as exact digits** (a u64 that `JSON.parse` would round) — do not round-trip the seed
  through a JS `Number`. dag-ml owns the fold loop + OOF assembly + lineage; the refit (full-train)
  is fit directly with libn4m. `DagMlEngine` falls back to direct `runPipeline` orchestration on any
  error, and `src/engine/dagml.ts` (`compileWithDagMl`) is the lighter compile/validate path.
  Remaining: REFIT/PREDICT phases through dag-ml + a real data-provider — see README roadmap.

- **Two build modes share one app.** `vite.config.ts`: default → served site with lazy WASM
  (`base: './'`); `--mode singlefile` adds `vite-plugin-singlefile` → one HTML with all JS/CSS and
  all WASM base64-inlined (`scripts/make-standalone` is not needed). The single-file is large and
  uses the JS PLS backend offline; the served build uses libn4m + dag-ml.

## Gotchas

- `vite build` succeeds even with type errors — always run `npm run typecheck` separately.
- libn4m does **not** clamp `n_components`; `orchestrate.ts` clamps it to `min(n_components, n, p)`
  per fit (the JS backend clamps internally). Keep that clamp when touching the run loop.
- Classification class vocabulary must be sorted **consistently** between `dataset.ts`/`samples.ts`
  (`encodeTarget`) and `orchestrate.ts` (`classInfo`) — both `.sort()` — or PLS-DA labels mislabel.
- Smoke selectors depend on exact strings: `"Run pipeline"`, `"CV Scores"`, the
  `"{n} samples × {n} wavelengths"` badge, the sample-button text (`Fruit purée`, `NIR protein`,
  `7 classes`), and `"compiled by dag-ml"`. Don't rename these without updating `tests/*.mjs`.
- Webfonts come from a Google Fonts `@import` (served); offline falls back to the system stack.
- Reuse upstream — shadcn primitives under `src/app/components/ui/` and the brand theme in
  `src/styles/theme.css` mirror nirs4all-studio / nirs4all.org. Don't reimplement NIRS/IO/ML here.
