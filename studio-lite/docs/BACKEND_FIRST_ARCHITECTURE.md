# studio-lite — backend-first architecture & migration roadmap

> **Thesis.** `dag-ml` + `nirs4all-methods` + `nirs4all-formats` + `nirs4all-io`
> (compiled to WASM) **are** the nirs4all library in the browser. **studio-lite is
> a frontend shell over dag-ml** — exactly as nirs4all-studio is a shell over the
> Python lib. Therefore: **no NIRS / ML / data logic lives in TypeScript.** The TS
> is UI + WASM glue only. Anything missing is implemented **in the lib (Rust/C++)**,
> **bound to WASM** (and documented so the Python/R/MATLAB/… bindings can follow),
> then **wired into the frontend**. This is not a one-shot — `methods` keeps growing.

This document is the état des lieux and the phased plan to get there. It is the
source of truth for "where does this belong?".

---

## The rule (decision procedure for any new capability)

```
need a preprocessing / model / split / metric / materialization / explanation?
  └─ implement it in the owning lib:
        numerics (preproc + models + transforms)      → nirs4all-methods (libn4m, C++)
        orchestration (splits, CV, OOF, select, refit,
          predict, metrics, lineage, leakage)         → dag-ml (Rust)
        data contract (schema, plan, provider, views)  → dag-ml-data (Rust)
        dataset assembly (resolve→infer→configure→
          materialize, roles, joins, partitions)       → nirs4all-io (Rust, Phase 2)
        vendor file decoding (~58 formats)             → nirs4all-formats (Rust)
  └─ expose it via that lib's wasm-bindgen / emscripten binding
  └─ document it for the other bindings (abi_method_map / ADR / binding guide)
  └─ wire it in studio-lite as UI + a thin call (no math)
```

If a change would add an algorithm, a fold rule, a metric, a join, or a parse to
`studio-lite/src/**`, it is in the wrong repo.

---

## Target data/compute flow (all WASM, browser)

```
bytes ─ nirs4all-formats ─► SpectralRecord[]            (decode, Rust)
      ─ nirs4all-io ──────► AssembledDataset             (resolve→infer→configure→materialize, Rust)
      ─ nirs4all-io-dagml ► CoordinatorDataPlanEnvelope  (data contract, Rust)
      ─ dag-ml-data ──────► WasmInMemoryProvider          (serves feature/target blocks by sampleId)
      ─ dag-ml ───────────► FIT_CV→SELECT→REFIT→PREDICT   (owns splits, OOF, metrics, selection, lineage)
            └─ per (node,fold) calls a controller that ONLY dispatches the operator to:
      ─ nirs4all-methods ─► fit/transform/predict         (libn4m numerics)
            ◄─ ExecutionBundle (scores, OOF, predictions, lineage) → UI
```

studio-lite renders this and feeds back user intent (DSL, split config, files).

---

## État des lieux — what each lib owns vs. exposes (verified)

### dag-ml (Rust) — orchestration. **Owns the logic; under-exposes it.**
- **Already implemented in core:** `KFoldSpec` / `GroupKFoldSpec` / `NestedCvSpec`
  splitters that build a validated, fingerprinted `FoldSet` (`crates/dag-ml-core/src/fold.rs`);
  the `FIT_CV → SELECT → REFIT → PREDICT → EXPLAIN` scheduler with OOF-by-sample_id,
  leakage refusal, nested-CV invariants (`runtime.rs`); **regression** metrics
  (RMSE/MAE/MSE/R²) (`metrics.rs`); selection/ranking (`selection.rs`); lineage +
  fingerprints; `RuntimeDataProvider` trait + `execute_campaign_phase_with_data_provider`.
- **dag-ml-wasm exposes today:** validate/compile/plan + `execute_campaign_phase_json`
  (the JS-controller execution I added).
- **Missing in WASM (must add):**
  - fold builders: `kfold_split_json` / `group_kfold_split_json` / nested — so the
    host stops building folds in TS;
  - **classification metrics in Rust** (`metrics.rs` is regression-only today) + their
    WASM scoring export;
  - `select_*_json` (SELECT) and ideally a single `run_campaign_json` (FIT_CV→…→PREDICT);
  - provider-aware execution export (bridge `RuntimeDataProvider` ↔ dag-ml-data).
- **Controller contract today vs. target:** today the JS controller does fold lookup
  **and** numerics **and** builds metrics. Target: controller receives a `NodeTask`
  (dag-ml already chose the fold), fetches blocks by sample_id from the provider,
  calls **one** libn4m operator, returns a `NodeResult` (predictions + handles). No
  folds, no metrics, no preprocessing math in the controller.

### nirs4all-methods (C++ / libn4m) — numerics. **Has it; barely bound.**
- libn4m exports ~260 `n4m_pp_*` preprocessing + ~130 model symbols, all behind a
  uniform C ABI (`create`/`fit`/`transform`/`destroy`, and `n4m_model_fit`/`predict`
  via a `Config`+`Algorithm`+`Solver`).
- **JS/WASM binding exposes only `fitPls`/`predictPls`** via two legacy raw-pointer
  helpers in `bindings/js/src/wasm_entry.c` (built by the `pls4all_wasm` emscripten
  target). It does **not** scale (one wrapper per algorithm).
- **Fix (scales as methods grows): a generic call-operator-by-id surface** in the
  binding — `n4m_wasm_operator_fit(op_id, params, X, Y?) -> handle`,
  `n4m_wasm_operator_transform(handle, X) -> matrix`, `…_destroy`, plus
  `…_get_state` / `…_fit_from_state` so **fitted preprocessing state (e.g. MSC
  reference) crosses the boundary as plain numbers** (for `.n4a` and predict-later).
  Adding a method later = one switch case + one enum value, not a new wrapper.
- **Cross-binding obligations per addition:** update `catalog/abi_method_map.yaml`,
  `cpp/abi/expected_symbols_*.txt` (ABI snapshot), `docs/abi/changes_log.md`, and the
  cross-binding parity test. Python FFI decls are generated; JS/R/MATLAB follow the
  same operator-id table.

### nirs4all-io (Rust, Phase 2) — dataset assembly. **Logic exists; not WASM-bound.**
- **io WASM exposes today:** inference/validation only (`inferDataset`/`inferFiles`/
  `inferRecords`/`to_spec`/`validate`). **No materialize.**
- **Rust already has** `resolve→infer→configure→materialize` (`crates/nirs4all-io`,
  `materialize/assemble.rs`, `spectrodataset.rs`) and the **`nirs4all-io-dagml`
  bridge** that emits the `CoordinatorDataPlanEnvelope`. Phase 2 is **unblocked**
  (gate GREEN); the WASM binding is roadmap track **T14**.
- **Fix:** WASM-expose `assembleDataset(spec, files) -> AssembledDataset` (numeric
  X/y/sampleIds/partitions/axis/taskType) and `to_dag_ml_data(assembled) -> envelope`.
  This deletes the ~350 lines of TS row-assembly + target-alignment.

### nirs4all-formats (Rust) — decoding. **Correct already.**
- `openBytes`/`probeBytes`/`readerCatalog` decode in Rust; the browser never parses
  bytes in JS. No change needed (a CSV fast-path may stay for plain user CSVs).

### dag-ml-data (Rust) — data contract. **Correct, now wired.**
- Schema/plan/sample-relations/provider; `WasmInMemoryProvider` serves blocks by
  sampleId. Already integrated. Long-term, its envelope should come from
  `nirs4all-io-dagml`, not be hand-built in TS.

---

## studio-lite/src classification — keep vs. move-to-backend

| TS file | Verdict | Owner once migrated |
|---|---|---|
| `components/**`, `app/**` | **KEEP** (UI) | — |
| `engine/dagml.ts`, `dagml-engine.ts`, `dagml-data.ts`, `backends.ts`, `main-engine.ts`, `client.ts` | **KEEP as thin glue** — strip orchestration; controller = operator-dispatch | dag-ml drives |
| `catalog/**` | **KEEP** but generate from the backend catalog (`abi_method_map.yaml` / dag-ml graph-spec) | methods/dag-ml catalog |
| `lib/n4a.ts` | **KEEP** (frontend export format) — align with nirs4all's `.n4a` once defined | — |
| `engine/algo/pls.ts` (JS NIPALS) | **DELETE** | nirs4all-methods (libn4m) |
| `engine/algo/preprocessing.ts` (JS SNV/MSC/SG/…) | **DELETE** | nirs4all-methods (`n4m_pp_*`) |
| `engine/algo/linalg.ts` | **SHRINK** to view marshalling; CV shuffle → dag-ml | dag-ml / methods |
| `engine/kfold.ts` | **DELETE** | dag-ml fold builders |
| `engine/orchestrate.ts` (fit-on-train, CV loop, OOF, refit) | **DELETE** | dag-ml scheduler |
| `engine/metrics.ts` | **DELETE** (regression already in dag-ml; add classification to dag-ml) | dag-ml `metrics.rs` |
| `data/dataset.ts` (CSV materializer) | **DELETE** (keep only a tiny CSV→bytes shim if needed) | nirs4all-io assemble |
| `data/wasm-io.ts` `materialize`/`rowsFrom`/`buildTargetResolver`/`parseTargetTable` | **DELETE** | nirs4all-io assemble |
| `engine/backends.ts` `jsBackend` (NIPALS fallback) | **DELETE** once libn4m is the only numeric path | — |

Net: the entire `engine/algo/**`, `kfold.ts`, `orchestrate.ts`, `metrics.ts`, and most
of `data/*.ts` disappear. studio-lite becomes UI + (catalog, DSL builder, WASM calls).

---

## Phased roadmap (incremental; each phase keeps the demo green)

Order chosen so the demo never regresses and each phase removes a TS reimplementation.

**Phase A — methods: generic operator surface (kills JS numerics).**
1. nirs4all-methods: add `n4m_wasm_operator_{fit,transform,destroy,get_state,fit_from_state}`
   dispatcher + operator-id table; export the existing `n4m_pp_*` (SNV/MSC/SG/deriv/
   detrend/normalize/gaussian first, then the rest) and the PLS/PLS-DA models; ABI
   snapshot + `abi_method_map.yaml` + changes_log + parity test.
2. studio-lite: route preprocessing + model fit/transform through the new binding;
   **delete `algo/pls.ts` + `algo/preprocessing.ts` + `jsBackend`.** Catalog entries
   already carry the symbol ids.
3. Result: all numerics are libn4m. "More preprocessings / more models" becomes "add a
   catalog entry" once the symbol is bound — no TS.

**Phase B — dag-ml: own splits, CV config, metrics, selection.**
1. dag-ml-wasm: expose fold builders (kfold/stratified/repeated/shuffle/holdout) and a
   split config in the campaign; add **classification metrics** to `metrics.rs` + score
   exports; expose SELECT; (optionally) `run_campaign_json` for the whole sequence.
2. studio-lite: the **two explicit splits** become config sent to dag-ml — Split 1
   (train/test, "from files" or holdout) and Split 2 (CV strategy) — dag-ml builds the
   FoldSet and computes metrics. Controller becomes pure operator-dispatch.
   **Delete `kfold.ts`, `orchestrate.ts`, `metrics.ts`.**
3. Result: splits/CV/OOF/metrics/selection all in dag-ml; the user's "splits explicites"
   are a backend feature surfaced in the UI.

**Phase C — io: materialize in Rust, zero TS assembly.**
1. nirs4all-io: WASM-expose `assembleDataset` + `to_dag_ml_data` (Phase-2 track T14).
2. studio-lite: upload → formats decode → io assemble → io→dag-ml-data envelope →
   provider. **Delete `data/dataset.ts` + the `materialize`/target-alignment half of
   `data/wasm-io.ts`.** Samples load through the same path.
3. Result: no dataset assembly, no target join, no axis/task inference in TS.

**Phase D — catalog & bundle from backend.**
1. Generate `catalog/**` from `abi_method_map.yaml` + dag-ml graph-spec (validated in CI).
2. Align `.n4a` with nirs4all's bundle definition.

After A–C, `studio-lite/src/engine/algo/**`, `kfold.ts`, `orchestrate.ts`, `metrics.ts`,
and `data/dataset.ts` are gone, and the shell is honest: **UI over dag-ml**.

---

## Gates (per repo, per phase)

- nirs4all-methods: `cmake --preset` build, ABI snapshot diff, cross-binding parity test.
- dag-ml / dag-ml-data: `cargo fmt --check`, `clippy -D warnings`, `cargo test --workspace`,
  contract validation (`scripts/validate_contracts.py`).
- nirs4all-io: Python goldens + Rust parity (`pytest -m parity`), CLI envelope golden.
- studio-lite: `typecheck`, `vitest`, `validate:catalog`, `build`, `build:single`, browser smokes.

Each phase: lib green → binding green (+docs) → frontend green → deploy.

---

## Current state (2026-06-05)

Progress retiring the JS shadow engine, lib by lib:

- **Phase A — DONE (deployed).** Preprocessing numerics run in **libn4m** (C++ → WASM)
  via the generic operator dispatcher (`n4m_wasm_pp_*`); studio-lite's served path uses
  libn4m for all transforms, MSC state round-trips for `.n4a`. JS preprocessing is now
  strictly the offline `file://` fallback. Codex-reviewed (8 findings fixed).
- **Phase B — DONE (deployed).** **dag-ml** builds the CV fold set in WASM
  (`kfold_split_json` / `stratified_kfold_split_json`; new `StratifiedKFoldSpec` in core,
  OOF-safe). The served run no longer builds folds in TS (`kfold.ts` is offline-only).
  *Remaining B.2 (smaller):* classification metrics + SELECT into dag-ml to retire
  `metrics.ts` + the TS scoreNode; CV strategy picker in the UI.
- **Phase C — BLOCKED on upstream io Phase-2.** The nirs4all-io wasm crate is deliberately
  *fs-free* and depends only on `nirs4all-io-core` (inference); the `assemble/materialize`
  facade is fs-based (`crates/nirs4all-io`). Exposing `assembleDataset`/`to_dag_ml_data`
  in WASM (Phase-2 track T14) needs an fs-free assemble in io first. Until then studio-lite
  still materializes X/y in TS (`data/dataset.ts`, `data/wasm-io.ts`).
- **Phase D — minor, deferred.** Generate the catalog from the backend; align `.n4a` with
  nirs4all's bundle.

Net: the two heaviest numeric concerns (preprocessing + cross-validation) are now Rust/C++
in the public demo. The remaining TS numerics are the dataset assembly (Phase C, gated on
io Phase-2) and the display/selection metrics (Phase B.2).
