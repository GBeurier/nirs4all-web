# Web app agent operations

Detailed operations reference for `nirs4all-web/web-app`. Obligations that always apply are in `AGENTS.md`; this document holds the full toolchain, gate and smoke inventory, architecture and gotchas, moved from the former `CLAUDE.md` with these intentional edits only: one first-person phrase reworded, the preview-stop command replaced by PID-based guidance (with `PREVIEW_PID=$!` capture), and this scope statement added. Runtime and fallback descriptions throughout are current Web-app context only; they neither certify capability nor authorize any new fallback. Read it before changing engine, data, catalog, persistence or WASM code.

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
export CHROME=${CHROME:-/usr/bin/google-chrome}
nohup npm run preview -- --port 4345 --strictPort >/tmp/prev.log 2>&1 &
PREVIEW_PID=$!; sleep 4
# whole gate suite — every tests/*smoke.mjs (the *-timing probe is excluded by the glob):
for t in tests/*smoke.mjs; do SMOKE_URL="http://localhost:4345/" node "$t" || break; done
# stop the preview server here (see below), then:
SMOKE_URL="file://$PWD/dist-single/index.html" node tests/smoke.mjs   # offline single-file (same strict dag-ml route, inline worker)
```

Stop the preview server only by its own recorded PID/process group: use the `PREVIEW_PID` recorded at launch, verify that it is still your process, and signal only that PID/group; never use broad pattern kills such as `pkill -f`.

The suite covers the **core path** — `smoke` (load→run→results→predict with dag-ml & libn4m),
`classification` (PLS-LDA → confusion), `wasm-upload` (vendor SPC decode, uses
`../../nirs4all-formats/samples`), `amylose-folder` (the nirs4all-io CSV `X*`/`Y*` train/test folder
path) — plus one smoke per editor/feature surface added since: the full DAG bucket (`dag-ops`,
`branch` feature-union, `generators` sweep), `split` / optional `cv-optional` / optional `no-model`
sequencing, the AOM family (`aom`, `pop`), the extra catalog models (`new-models` engine-level role
API + N4ME round trip, `new-models-ui` for a manifest model outside the retired dispatcher subset,
`operators`), the training-row export consent (`training-rows-export`: Kernel PLS, Cancel exports
nothing, the consented bundle records `containsTrainingRows` and re-imports identically), the
column identity at predict (`column-identity`: matching header checked, permuted columns refused,
header-less file stated as positional), the broad model pack (`new-pack` engine-level + `new-pack-ui` for ECR / O2PLS / AOM
Ridge blender / AOM operator-PLS stack and the SPlit twinning / SystematicCircular splits), the
Explore playground (`explore` — preprocessing preview + client PCA), the `palette`, `replicates` (a
Xcal/Xval upload with repeated Sample_IDs and NA targets: val held out, missing targets excluded and
counted, repetition column), and `persistence`
+ `n4a-roundtrip` (session and `.n4a` round-trips; the `.n4a` is a Core V1 container declared by owner `nirs4all.web-host`, read back through Core, with member SHA-256 = declared fingerprint, the Methods-only route refusing it, and delta 0 after re-import; the host payload v3 checks it carries
N4ME states and the re-imported model predicts identically). `tests/aom-cassava-timing.mjs` is a one-off
`fitAom` wall-time probe, **not** part of the gate (and is excluded by the `*smoke.mjs` glob). Each
smoke is independent and reads the served app from `$SMOKE_URL`; `new-models-smoke.mjs` and
`new-pack-smoke.mjs` are self-contained (load the staged WASM directly) and ignore it.

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
       → n4m methods by method id through the libn4m role API      [src/engine/methods/n4m.ts]
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

- **Pluggable model backend, dag-ml orchestration.** CV, refit and scoring run in dag-ml
  (`src/engine/dagml-engine.ts`: preprocessing fit on the train fold only; OOF joined by `sampleId`,
  never row order; test partition held out of CV; refuses to train without targets). `src/engine/orchestrate.ts`
  keeps the shared fit/predict/export helpers over a `ModelBackend`; `src/engine/backends.ts` provides the
  `libn4m` backend (`@nirs4all/methods`, C++→WASM, staged in `src/engine/wasm/methods/`).
  `MainEngine` (`src/engine/main-engine.ts`) runs dag-ml and **refuses** (`unavailable_backend`) when it is
  unavailable: there is no direct compatibility runner and no JS-backend fallback. Imported non-`nativeRefit`
  libn4m / ml.js models keep their predict and export paths; models of the retired JS backend are refused
  explicitly (`javascript_model_backend`). The old direct runner survives only as the test-only oracle
  `src/engine/testing/run-pipeline-oracle.ts`, used to build such imported-model fixtures.

- **The engine runs in a Web Worker (served build).** `client.ts` wraps `MainEngine` in a
  `WorkerEngine` (`src/engine/worker-engine.ts` + `worker.ts`) so heavy libn4m / dag-ml WASM compute
  (notably the AOM operator screen on a large dataset) never blocks the UI thread — progress streams,
  Cancel works, and a cancel mid-schedule is normalized back to an `AbortError` (App suppresses it).
  The **single-file** build aliases `@/engine/client` → `client.singlefile.ts` (vite.config.ts,
  `singlefile` mode, strict-wasm profile) and runs the same `MainEngine` in an inline classic Blob worker
  (a module worker that code-splits its WASM via dynamic `import()` can't be inlined into one HTML);
  without `Worker` it refuses with a typed error. `src/engine/guard.ts` warns (or refuses) before an oversized AOM/POP screen so a long run
  is never silent. **Don't move engine compute back onto the main thread.**

- **One ingestion path, nirs4all-io, into one `MaterializedDataset`.** `src/data/wasm-io.ts`
  (`ingestFiles`) is the only active dataset entry: delimited text goes to io as bytes, other files
  are decoded by formats first (formats decode → io infer → `assembleDataset`). The projection
  reads the owner's logical `x[].data` + `validity`, the `y.columns` table (row-major `y.data`),
  io's declared sample/observation/group columns and a closed partition mapping (train/cal →
  train, test/holdout/val/validation → the single held-out set, predict/pred/infer/unknown →
  predict); it refuses several feature sources, several targets without a user choice, unknown
  partition names and more than one held-out partition, and labels an undeclared sample key as
  positional. Rows that repeat a declared sample id are one physical sample (grouped CV by default)
  and need io's declared, unique observation ids, otherwise they are refused (nothing is
  synthesised; `s{i}` stays an internal row handle). A declared sample key that a partition does not
  carry is refused, not downgraded to positions. The feature axis is the owner's `feature_axes`
  numeric packet decoded with the owner `numericCoordinates` (`wasm/io/numeric-wire`), an unset unit
  shows as `unspecified`, text headers are logical labels. The complete io record, spec, analysis and
  input bytes stay attached to the dataset by reference (`ioRetainedOf`, symbol `IO_RECORD`) and to
  every `IoIngestionRefusal`, which also carries the pending target decision. Predict reads its
  new-spectra file (and a separate reference file) through io too (`readPredictionFile`,
  `readReferenceFile`): io decides delimiter, header row and column roles, Web checks the owner output
  against the model's feature count and reports header vs positional from io's header unit.
  `src/data/dataset.ts` (`buildDataset`) survives only as a TEST ORACLE for the io-vs-CSV parity
  test and fixtures, never a runtime fallback. Target-less datasets are allowed (explore/
  predict), and the *engine* refuses to train without targets. `src/data/samples.ts` bundles four
  real demos via `?raw`; they are assembled by io like any upload.

- **Native nodes come from the n4m manifest and run through the n4m role API.**
  `src/catalog/n4m-manifest.json` is the checked-in `n4m_cli --manifest-json` output (`npm run
  n4m:manifest` refreshes it, `npm run check:n4m-manifest` checks it; both need `--cli <n4m_cli>` or
  `N4M_CLI`). `src/catalog/native.ts` projects it through `nirs4all-ui/nodeRegistry`
  (`projectN4mManifest`) into one node per method the web pipeline can place — transformers /
  selectors (preprocessing), sample filters and augmenters (train-only row operators of the main
  chain), regressors / classifiers (model; transformer+regressor methods only as models), splitters
  (split) — skipping methods that require fit inputs a web dataset cannot supply (groups, feature
  groups, blocks, a transfer target). The DSL token is `n4m:<method_id>` (the portable token
  Studio serializes). `src/engine/methods/n4m.ts` executes every such node by method id through the
  staged `@nirs4all/methods` role API (`methodClass` + manifest-typed params → fit / transform /
  predict / predictLabels / getMask / split / augment) and persists fitted states as N4ME bytes
  (`toN4me`, reloaded by `NativeEstimator.fromN4me`); the `.n4a` file is a Core V1 container (owner `nirs4all.web-host`, feature `nirs4all-web-host@1`, member `host/bundle.json`, raw SHA-256 identity) whose host payload v3 stores every typed array as exact little-endian bytes and carries the N4ME states base64
  (`$u8`). Session states are in-memory checkpoints (`checkpoint`: N4ME with the training-row
  opt-in, plus libn4m's `containsTrainingRows` per state); the `.n4a` export is a separate,
  shareable copy made by `Engine.exportModel(model, { allowTrainingRows })`, which re-serializes
  every state through its backend (`exportN4me` → libn4m refuses training rows without the
  opt-in). The Results export asks for explicit consent when `trainingRowSteps(model)` is not
  empty — never set `allowTrainingRows` implicitly. `RolePipeline` is not used to fit (the web
  chain also runs augmenters, feature unions, one-hot regressor-classifiers and ml.js models); it is
  used at predict for column identity (re-audit R09 / F03): a model fitted on a dataset with a
  spectral axis or header names records them as `FittedPipeline.features` (kept in `.n4a`),
  `Engine.predict(..., featureNames)` refuses named input columns that differ in names, order or
  count (`src/engine/feature-identity.ts`), and when the fitted chain is N4ME transformers / selectors
  + an N4ME model the libn4m backend predicts it as one `RolePipeline.fromStates(..., {
  featureNames })` so libn4m checks the names too (same states, bit-identical predictions; model
  states keep their `fitParams` for that recipe). Unnamed input (no header) and models without
  `features` (index axis, older bundles) are positional, and the Predict panel says so. Native regressors are also offered for classification (one-hot targets + argmax;
  single-target methods refuse natively). The `aom_pop.*` models are `autonomous` (they screen their
  own operator bank on raw X). `src/catalog/nodes.ts` adds the hand-written models the manifest does
  not describe (ml.js, PLS Canonical / SVD on the legacy coefficient dispatcher); their ABI symbols
  are gated by `scripts/validate-catalog.mjs` against `expected_symbols_*.txt` — this is why **OPLS
  is intentionally absent** — and it also fails when the manifest ABI differs from the staged methods
  WASM. The engine dispatches on the node `type` token. Presets/builder live in
  `src/catalog/presets.ts` + `src/components/pipeline/`.

- **dag-ml EXECUTES the cross-validation (not just plans it).** `src/engine/dagml-engine.ts`
  (`DagMlEngine`, the served-build engine) compiles the pipeline DSL → GraphSpec, builds a `FoldSet`
  from the CV folds, and calls **`dag-ml-wasm`'s `execute_campaign_phase_json`** (an export added in `dag-ml/crates/dag-ml-wasm/src/lib.rs`) to run FIT_CV through dag-ml's real
  `SequentialScheduler` in WASM. Per (node, fold) the scheduler invokes a **synchronous JS
  controller** (`JsRuntimeController` on the Rust side) that resolves the fold's samples via
  `task.fold_id` + the host `FoldSet` and runs preprocessing + PLS through libn4m; it must echo
  `task.seed` **as exact digits** (a u64 that `JSON.parse` would round) — do not round-trip the seed
  through a JS `Number`. dag-ml owns the fold loop + OOF assembly + lineage; the refit (full-train)
  is fit directly with libn4m. The strict profile fails closed on a scheduler error; the transitional
  development profile may fall back only on an explicit `allowFallback` request. `src/engine/dagml.ts` (`compileWithDagMl`) is the lighter compile/validate path.
  Remaining: REFIT/PREDICT phases through dag-ml + a real data-provider — see README roadmap.

- **Two build modes share one app.** `vite.config.ts`: default → served site with lazy WASM
  (`base: './'`); `--mode singlefile` adds `vite-plugin-singlefile` → one HTML with all JS/CSS and
  all WASM base64-inlined (`scripts/make-standalone` is not needed). The single-file is large and
  runs the same libn4m + dag-ml route as the served build (strict-wasm, inline worker).

## Gotchas

- `vite build` succeeds even with type errors — always run `npm run typecheck` separately.
- libn4m does **not** clamp `n_components`; `orchestrate.ts` clamps it to `min(n_components, n, p)`
  per fit. Keep that clamp when touching the run loop.
- Classification class vocabulary must be sorted **consistently** between `dataset.ts`/`samples.ts`
  (`encodeTarget`) and `orchestrate.ts` (`classInfo`) — both `.sort()` — or PLS-DA labels mislabel.
- Smoke selectors depend on exact strings: `"Run pipeline"`, `"CV Scores"`, the
  `"{n} samples × {n} wavelengths"` badge, the sample-button text (`Fruit purée`, `NIR protein`,
  `7 classes`), and `"compiled by dag-ml"`. Don't rename these without updating `tests/*.mjs`.
- Fonts are defined in `src/styles/fonts.css` as local/system stacks only; do not reintroduce remote
  font imports.
- Reuse upstream — shadcn primitives under `src/app/components/ui/` and the brand theme in
  `src/styles/theme.css` mirror nirs4all-studio / nirs4all.org. Don't reimplement NIRS/IO/ML here.
