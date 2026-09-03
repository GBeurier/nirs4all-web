# nirs4all-web · browser app

A **single-page, full-WASM "mini nirs4all-studio"** — a public demonstrator that runs the whole
NIRS modelling loop **in the browser, no Python**: upload spectra → explore & configure the dataset
→ build/choose a simple pipeline from **nirs4all-methods** nodes → **run it** → inspect scores
(refit / CV / folds) → see residual/parity views → **predict on new spectra**. Everything runs
locally; nothing is uploaded.

> Part of the [nirs4all](https://nirs4all.org) ecosystem. This is the standalone browser/WASM
> client, not new numerical code: the
> numerics live upstream in `nirs4all-methods` (libn4m), the portable subset is exposed through
> the vendored `nirs4all` aggregate, and broader workflows are orchestrated by `dag-ml`.

## Run it

```bash
npm install
npm run dev            # dev server
npm run build          # strict-wasm static product → dist/ (primary, lazy-loaded WASM)
npm run build:transitional # explicit served compatibility build → dist-transitional/
npm run build:single   # single offline HTML → dist-single/index.html (opens via file://)
npm run test           # vitest: engine numerics + data assembly
npm run test:strict-profile # strict positive/negative runtime gate
npm run typecheck      # tsc --noEmit
npm run validate:catalog   # fail if a node claims a non-exported libn4m ABI symbol
npm run smoke:rt-fallback:strict       # strict build rejects allowFallback:true
npm run smoke:rt-fallback:transitional # transition build proves diagnosed fallback
```

The `strict-wasm` product profile fails closed if native/WASM execution, the
`dag-ml-data` provider, or the native scheduler cannot serve the request. It
also rejects JavaScript model prediction and `allowFallback:true`. The
development/test and single-file profiles intentionally retain the explicit
transitional path while migration is in progress; neither profile permits a
remote compute provider.

Runtime browser smokes use a local Chromium (`CHROME`). Use the profile-aware
runner instead of invoking `rt-fallback-smoke.mjs` directly: the runner reads
the built profile manifest and passes the exact expectation to the smoke.

The full smoke inventory also contains prerequisite-bearing cross-runtime gates:
`converted-predictions-render` and `performance-compare` consume generated
artifacts, `repository-best-pipeline` consumes a Python handoff/oracle, and the
SPC/amylose dataset checks use optional external fixture directories. Their
status is separate from the autonomous strict/transitional WEB-001 gates.

## Architecture — the full nirs4all WASM stack

```
 upload → nirs4all-formats WASM (decode ~58 formats) → nirs4all-io WASM (infer + DatasetSpec)
        → MaterializedDataset
 portable pipeline subset → vendored nirs4all aggregate → nirs4all-methods WASM
        (Kennard-Stone, SNV, Savitzky-Golay, PLS, n_components range sweep)
 broader pipeline (catalog) → dag-ml WASM compiles the DSL → GraphSpec, then its SequentialScheduler
        EXECUTES the cross-validation in-browser: per (node, fold) it invokes a JS controller that
        runs preprocessing + PLS/PLS-DA via libn4m WASM; dag-ml owns the fold loop, OOF assembly
        (by sampleId) and lineage. Refit (full-train) is fit directly with libn4m.
        → RunResult (refit/CV/folds + predictions + dag-ml lineage) → results / residuals / predict
```

Five real WASM surfaces participate: **formats** (decode), **io** (inference), **datasets**
(catalog metadata utilities), **dag-ml** (the coordinator — compiles *and executes* the
cross-validation), and **libn4m** (the PLS numerics), all reached through the vendored
`nirs4all` aggregate where possible.

The Archive V2 consumer passes bytes to Core's Rust/WASM validator, then imports
the single predictor through Methods WASM. It supports named multi-target raw
PLS in N4MM format 1 and raw-feature replay of the exact embedded
`SNV(ddof=0) -> Savitzky-Golay(mode=interp) -> PLS` profile in format 2. Web
does not rebuild either pipeline or model. Archives carrying conformal,
robustness, optimizer, multiple-predictor, external, or host-only payloads are
refused; the app may display conformal metadata but does not produce a native
multi-target conformal presentation.

## Custom app host

The browser app also serves as the reference for a **client-side custom host** that composes:

- `nirs4all` (vendored from `../../nirs4all-core/bindings/wasm`) for browser-safe runtime loaders
  and the portable execution subset;
- `nirs4all-ui` (vendored from `../../nirs4all-ui`) for reusable components, pure view-model
  helpers, and shared brand assets.

The contract is pinned by `src/app/custom-app-host.contract.test.ts`,
`src/app/shared-ui-contract.test.ts`, and `src/app/client-side-only.test.ts`. The vendored core sync
script (`npm run vendor:core`) and the content-addressed UI package check
(`npm run check:ui-package`) are part of that contract: they must keep
the runtime surface, UI subpath exports, and UI assets available without introducing any backend
dependency.

The staged Core, dag-ml, datasets and dag-ml-data packages are content-addressed release-candidate
artifacts. `npm run check:core-shim` verifies the complete Core package inventory, while
`npm run check:wasm-artifacts` verifies provenance, byte hashes and live runtime witnesses for the
three WASM packages. Re-stage them reproducibly with their `npm run wasm:*` command and an exact
upstream checkout.

`examples/custom-app-host/` is a copy-out template for custom client-side hosts. It imports only the
public `nirs4all` and `nirs4all-ui` package surfaces and is pinned by
`src/app/custom-app-host-template.contract.test.ts`.
After publishing, `npm run smoke:published-custom-host` installs pinned npm packages in a clean
temporary directory and verifies that the public `nirs4all` + `nirs4all-ui` custom-host imports work
without the local vendors.

- **Engine contract** (`src/engine/types.ts`): one `Engine` interface (`run`, `predict`) with a
  pluggable `ModelBackend` (`orchestrate.ts`). `MainEngine` first routes the strict portable subset
  (`KennardStone`, `StandardNormalVariate`, `SavitzkyGolay`, `PLS`, `n_components` range sweep, no
  CV) through `nirs4all.runPortablePipeline()` and saves its serialized model for
  `predictPortablePipeline()`. Other served runs use `MainEngine` → `DagMlEngine`:
  dag-ml-wasm's `execute_campaign_phase_json` runs FIT_CV, calling a synchronous JS controller per
  fold that resolves the fold's samples (via `task.fold_id` + the host `FoldSet`) and runs the
  pipeline through the **libn4m** backend (real C++ PLS, WASM). The deployed
  `strict-wasm` profile refuses scheduler/provider/JavaScript fallbacks and
  rejects `allowFallback:true`. Only the explicit transitional profile may
  degrade a diagnosed scheduler failure to direct libn4m orchestration, and
  only when `allowFallback:true`; the offline single-file profile is likewise
  transitional, prefers inlined libn4m WASM, and reserves pure-JS NIPALS as its
  final legacy PLS-family fallback. Orchestration is leakage-honest
  (preprocessing fit-on-train, OOF-by-`sampleId`) and refuses to train without
  targets. The Rust execution binding lives in
  `dag-ml/crates/dag-ml-wasm` (`execute_campaign_phase_json` + a `JsRuntimeController`).
- **Native robustness handoff** (`RunOptions.robustnessEvidencePublicationHandoff`): browser/WASM
  runs can receive the same Studio/native spectral/OOD replay publication request used by cluster
  submitters. By default this app is client-side only and has no persistent prediction-array sidecar
  store, so `MainEngine` records a fail-closed `RunResult.robustnessEvidencePublicationTrace` with
  `status: "unsupported_runtime"`, the requested fields still listed as missing, and runtime counts
  for the in-memory dataset/predictions/model. Hosts that provide a real browser sidecar store can
  pass `RunOptions.robustnessEvidencePublisher`; the engine then reports `status: "published"` only
  when the publisher returns every requested field, `status: "incomplete"` when fields remain
  missing, and `status: "failed"` when the publisher throws. The built-in app still does not claim
  that `prediction_arrays.X`, `result_metadata.robustness_evidence.X`, or
  `result_metadata.robustness_evidence.predictor_bundle` were published unless such a host-sidecar
  publisher is explicitly supplied. The same handoff can carry the Studio/Python keyword ids
  (`predict.save_to_workspace`, `predict.workspace_metadata`, `predict.workspace_result_metadata`),
  required effects, and `conformalArtifactPolicy="prediction_publisher_does_not_persist_conformal_artifacts"`;
  Web preserves those fields as metadata and does not mint conformal guarantees. `src/engine/robustness-evidence-sidecar.ts` provides
  a browser-sidecar publisher and an IndexedDB store factory for hosts that want to persist the
  row-aligned `X` matrix and a `.n4a` predictor bundle locally; it is opt-in and must run in the same
  runtime context as `MainEngine`. `MainEngine` also accepts the serializable
  `RunOptions.robustnessEvidenceSidecar = { kind: "indexeddb" }` option directly and resolves it to
  the same publisher. Served builds that run through `WorkerEngine` cannot send a function publisher
  through `postMessage`; pass `robustnessEvidenceSidecar` instead, and the worker will create the
  IndexedDB publisher in its own context.
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
target/task/split edits); continued visual polish.

## Verification

`npm run typecheck` · `npm run test` · `npm run validate:catalog`. Browser smokes (need a local Chromium via `CHROME=…`): `tests/smoke.mjs`
(regression load→run→results→predict), `tests/classification-smoke.mjs` (PLS-DA → confusion),
`tests/wasm-upload-smoke.mjs` (vendor SPC decode). All pass on both the served build and the
`file://` single-file build.
