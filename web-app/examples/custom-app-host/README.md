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
`../../vendor/npm/nirs4all-ui-0.1.13.tgz` artifact, so it is tested against the same vendored release
candidate as `web.nirs4all.org`.

## Host Boundary

The host owns:

- routing and app state
- local data loading policy
- icon components and CSS classes
- runtime execution policy

The reusable packages own:

- capability and runtime contracts from `nirs4all`
- portable pipeline execution entrypoints
- dataset/runtime/score view-models from `nirs4all-ui`
- presentational React components from `nirs4all-ui/components`
- conformal artifact, robustness summary, tuning summary, and keyword-registry projection helpers

The example demonstrates how a complex host can render the native
metadata contracts declared by the core capability manifest:

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

For `keyword.registry`, the host reads the manifest's `publishedConstants`
and `required_registry_entries` compatibility floor. `publishedConstants`
currently pins `ROBUSTNESS_SCENARIO_DISTRIBUTIONS = ["normal", "uniform"]`
so the host can build robustness distribution options without parsing prose.
The required entries include `run.tuning.space` as the object/mapping tuning-space keyword,
`run.tuning.force_params`, `predict.coverage`, `predict.all_predictions`, and
robustness scenario fields, plus `robustness.X`, `robustness.predictor`, and
`robustness.predictor_bundle` for the full Python explicit-X frozen-predictor
spectral replay path. They are preserved for forms and
custom hosts; they do not mean this browser aggregate executes HPO, conformal
calibration, or robustness campaigns itself.

The host does not compute conformal quantiles, infer guarantee status from raw
predictions, replay HPO trials, drive optimizers, recompute robustness metrics,
mutate ordered tuning-space patches, or select a scientific runtime based on
registry prose. Those operations remain owned by the full Python `nirs4all`
runtime and its published artifacts.
