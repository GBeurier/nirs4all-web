# nirs4all Custom App Host Example

This is a minimal client-side-only host that composes:

- `nirs4all` for the browser/WASM aggregate runtime surface.
- `nirs4all-ui` for reusable React components, pure view-model helpers, and brand assets.
- `nirs4all-ui/conformal`, `nirs4all-ui/robustness`, `nirs4all-ui/tuning`,
  and `nirs4all-ui/keywordRegistry` for metadata-only native artifact presentation.

It is intentionally separate from the full nirs4all-web app shell. The example does not import `@/engine/*`, app routing, state stores, or Studio/Web component internals.

## Run Locally

From this directory:

```bash
npm install
npm run typecheck
npm test
npm run build
```

The package uses file dependencies against `../../vendor/nirs4all` and the exact content-addressed
`../../vendor/npm/nirs4all-ui-0.2.2-local.20261107.2.tgz` artifact, so it is tested against the same pinned UI snapshot as the Web app.

## Host Boundary

The host owns:

- routing and app state
- local data loading policy
- icon components and CSS classes
- runtime execution policy

The reusable packages own:

- the capability manifest from `nirs4all` (`capabilityManifest()`: `schema`, `aggregate`,
  `runtimeSurfaces` and `executionProfiles`)
- public native execution, generic role and storage APIs, each with its own accepted data and recipe contract
- dataset/runtime/score view-models from `nirs4all-ui`
- presentational React components from `nirs4all-ui/components`
- conformal artifact, robustness summary, tuning summary, and keyword-registry projection helpers

The host lists the Core execution profiles, the content-type schemas each profile carries, and the
per-profile JavaScript/WASM `predict` entrypoints or explicit unsupported reasons. This reports declared
availability, not qualification, and does not mean a model fitted on one runtime surface is portable to another.

`createDemoDataset()` retains the original synthetic 12x4 numeric fixture, and
`createDemoPipeline()` retains KennardStone (`test_size: 0.25`) -> SNV -> PLS
(`n_components: 2`). The exported `runDemoPipeline()` helper explicitly rejects:
this standalone metadata template has no owner-backed adapter for that holdout
request. It is not wired to a visible button. Core retired the former
`runPortablePipeline` / `predictPortablePipeline` runner and its result types.
The public `runBrowserPipeline` API accepts native steps/candidates and a
CV/OOF protocol; it is not a drop-in executor for this KS declaration.
`N4mRolePipeline.fit` runs a native recipe on supplied training rows and does
not schedule the requested holdout. The example does not replace the request
with training on all rows or import Web app internals. This operation-specific
refusal does not change the Core capability declarations displayed above.

`../../scripts/smoke-published-custom-host.mjs` remains a separate historical
published-Core **0.4.7** smoke, with its original numeric fixture, recipe,
run/predict calls and generated app source. Its Core version guard rejects
other versions before installing packages or creating the generated app.
It is not a current-template generator or evidence for the local Core 0.5.0
surface; its historical UI/Methods defaults and prior provenance are retained.

The example also demonstrates how a complex host can render these native
metadata artifacts from sample fixtures through `nirs4all-ui`:

- `conformal.calibrated_result`
- `robustness.summary`
- `tuning.summary`
- `tuning.ordered_search_space`
- `keyword.registry`

For `robustness.summary`, the host reads the optional
`conformal_guarantee_status` and `spectral_replay` blocks from `summary.json`
through the public `nirs4all-ui/robustness` helpers and projects them as display
metadata only. It does not parse the full robustness report, replay spectra, or
infer a guarantee from coverage metrics.

For `conformal.calibrated_result`, the host projects the guarantee badge through
`createConformalGuaranteeViewForArtifact(...)`, so calibration replay provenance
is read from `conformal_guarantee_status.calibration_replay_source` first and
falls back to artifact-level `metadata.calibration_replay_source` when the full
Python artifact exposes it there. Optional
`metadata.tuning_calibration_source` is displayed as tuning calibration
provenance only; the host does not reinterpret `score_data`, recompute
intervals, or recalibrate locally.

For `tuning.summary`, the host reads optional optimizer metadata (`sampler`,
`pruner`, `seed`) and the safe `persistence` block (`resume`,
`storage_configured`, `study_name`, `optimizer_state_resume_supported`) from the
compact summary through the public `nirs4all-ui/tuning` helpers. It renders
these values as metadata only, does not receive raw storage URIs, and does not
replay trials or select an optimizer.

For `tuning.ordered_search_space`, the host reads the pre-execution
`nirs4all.tuning.ordered_search_space` artifact produced by Python/CLI through
`parseOrderedTuningSearchSpaceArtifact(...)` and
`createTuningSearchSpacePreview(...)`. It can show parameter counts, forced
parameter counts, schema identity and display labels for forms, but it does not
run HPO, infer candidate values, or mutate the search space. The template uses
the same compact fixture values as the full Python `ordered_search_space_v1`
contract test so custom-host behavior stays aligned with the source generator.

For `keyword.registry`, the host parses a small sample registry document with
`parseKeywordRegistryDocument(...)` and projects form sections and value options
(`run.engine`) through `nirs4all-ui/keywordRegistry`. The sample entry is a UI
fixture, not a Core capability or a required-entry contract, and it does not mean
this browser aggregate executes HPO, conformal calibration, or robustness campaigns itself.

The host does not compute conformal quantiles, infer guarantee status from raw
predictions, replay HPO trials, drive optimizers, recompute robustness metrics,
mutate ordered tuning-space patches, or select a scientific runtime based on
registry prose. Those operations remain owned by the full Python `nirs4all`
runtime and its published artifacts.
