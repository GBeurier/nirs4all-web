# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`nirs4all-web` is a single-page, **full-WASM public browser client** — a "mini nirs4all-studio"
that runs the whole NIRS modelling loop in the browser with **no Python and no backend**: upload
spectra → explore + configure the dataset → build/choose a simple pipeline from nirs4all-methods
nodes → run it → inspect scores (refit / CV / folds) → residual / parity / confusion views → predict
on new spectra → export. It consumes the upstream ecosystem libraries **as prebuilt/staged WASM** — it never
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
# whole gate suite — every tests/*smoke.mjs (the *-timing probe is excluded by the glob):
for t in tests/*smoke.mjs; do SMOKE_URL="http://localhost:4345/" node "$t" || break; done
pkill -f "vite preview"
SMOKE_URL="file://$PWD/dist-single/index.html" node tests/smoke.mjs   # offline single-file (JS-backend fallback)
```

The suite covers the **core path** — `smoke` (load→run→results→predict with dag-ml & libn4m),
`classification` (PLS-DA → confusion), `wasm-upload` (vendor SPC decode, uses
`../../nirs4all-formats/samples`), `amylose-folder` (the nirs4all-io CSV `X*`/`Y*` train/test folder
path) — plus one smoke per editor/feature surface added since: the full DAG bucket (`dag-ops`,
`branch` feature-union, `generators` sweep), `split` / optional `cv-optional` / optional `no-model`
sequencing, the AOM family (`aom`, `pop`), the extra catalog models (`new-models`, `new-models-ui`,
`operators`), the `palette`, and `persistence` + `n4a-roundtrip` (session and `.n4a` bundle
round-trips). `tests/aom-cassava-timing.mjs` is a one-off `fitAom` wall-time probe, **not** part of
the gate (and is excluded by the `*smoke.mjs` glob). Each smoke is independent and reads the served
app from `$SMOKE_URL`; `new-models-smoke.mjs` is self-contained and ignores it.

**Green gate** = typecheck + test + validate:catalog + build + build:single + the full `tests/*smoke.mjs`
suite all pass with no console errors.

## Architecture — the full nirs4all WASM stack

Data and compute flow through five real WASM engines (staged under `src/engine/wasm/<name>/`), all
in the browser, mirroring the ecosystem stack **formats → io → dag-ml-data → dag-ml + methods**:

```
upload → nirs4all-formats WASM (decode ~58 vendor formats)         [src/data/wasm-io.ts]
       → nirs4all-io WASM (inferDataset + DatasetSpec validation)  [src/data/wasm-io.ts]
       → MaterializedDataset (browser projection for the UI)
run    → dag-ml-data WASM (WasmInMemoryProvider): schema + plan + sample relations →
         CoordinatorDataPlan envelope (fingerprinted) → serves feature/target blocks
         by sampleId — the data-contract layer                     [src/engine/dagml-data.ts]
       → dag-ml WASM: compile DSL → GraphSpec, SequentialScheduler runs FIT_CV in-WASM,
         invoking a JS controller per fold                          [src/engine/dagml-engine.ts]
       → PLS / PLS-DA numerics by libn4m WASM                       [src/engine/backends.ts]
       → RunResult (refit/CV/folds + predictions + dag-ml lineage incl. dataProvider)
```

The UI is a **studio workbench** (`src/app/App.tsx`): a top runtime bar (brand + active-dataset
chip + dag-ml / dag-ml-data badges), a left workflow rail (Dataset → Explore → Pipeline → Results →
Predict) with progressive unlock, and one work panel per step. The pipeline step is a three-pane
editor — operator palette (`NodePalette`) → drag-and-drop flow canvas (`CanvasFlow`) → context
inspector (`Inspector`) — over the flat DSL, mirroring nirs4all-studio's editor in spirit.

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
  `src/engine/wasm/methods/`). `MainEngine` (`src/engine/main-engine.ts`) prefers libn4m and **falls
  back to the JS backend under `file://`** (the single-file build can't fetch the emscripten
  `n4m.wasm`). `StubEngine` = JS-backend engine kept for unit tests / fallback.

- **The engine runs in a Web Worker (served build).** `client.ts` wraps `MainEngine` in a
  `WorkerEngine` (`src/engine/worker-engine.ts` + `worker.ts`) so heavy libn4m / dag-ml WASM compute
  (notably the AOM operator screen on a large dataset) never blocks the UI thread — progress streams,
  Cancel works, and a cancel mid-schedule is normalized back to an `AbortError` (App suppresses it).
  The **single-file** build aliases `@/engine/client` → `client.singlefile.ts` (vite.config.ts,
  `singlefile` mode) to keep the engine in-thread: a module worker that code-splits its WASM via
  dynamic `import()` can't be inlined into one HTML, and the offline build uses the light JS backend
  anyway. `src/engine/guard.ts` warns (or refuses) before an oversized AOM/POP screen so a long run
  is never silent. **Don't move engine compute back onto the main thread.**

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
