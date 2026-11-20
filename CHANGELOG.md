# Changelog

## 0.6.0 — 2026-11-20

### Added

- Browse the owner catalog of public datasets, download supported selections
  directly from their original publishers, materialize them through Datasets/IO,
  and keep them in browser-local storage. Unsupported source profiles and
  acquisition failures are explicit; the application does not host datasets.

- Multimodal laboratory: fusion pipelines are edited in the shared rack editor
  (nirs4all-ui 0.2.7) as canonical nirs4all pipelines, one lane per source.
  Presets cover single-source baselines and early, embedding (training-fitted
  PCA scores), intermediate (MB-PLS, native multibranch network) and late
  (average, stacking) fusion; unsupported edits are refused with a reason.
  Every completed run of a dataset is compared in the shared Inspector.
- Training slides at `/multimodal-training/slides/` (presenter window, notes,
  PDF export) with conclusion charts from native laboratory scores.

### Removed

- The previous multimodal workshop PowerPoint, PDF and demo guide.

### Fixed

- Datasets with several target columns load again. Since 0.5.1 an upload whose
  target table held more than one column was refused at load ("choose the one to
  model — Web does not take the first"). Every target nirs4all-io assembles is now
  kept with its value and missing counts; Explore and the Playground show a target
  of the user's choice, and the target to model is chosen in the run settings.
- Missing values no longer block a dataset. Missing spectral values are loaded
  under nirs4all-io's `ignore` NA policy (kept, counted, shown as gaps) instead of
  aborting; previews and the Playground compute on the complete spectra and say
  how many samples they left out. When the spectra hold missing values, a run
  asks what to do with them, with their counts and no default: remove the
  affected samples, replace the values (by nirs4all-io: previous or next
  wavelength of the same spectrum, or a constant), or leave them as they are
  (the execution path then refuses non-finite spectra, and the refusal says so).
  Samples without a target value are left out of fitting and scoring, or stop
  the run, as chosen. No row is dropped from the loaded dataset.
- A target that nirs4all-io reads as text labels (a stray text cell among numbers)
  is a classification target with a visible hint, never a regression on its class
  codes; a target read differently across partitions is flagged instead of
  refusing the whole dataset.
- Reworded load refusals (no doubled period, no "did not assemble … assembled")
  and removed an owner function name from the PCA notice.
- An imported owner result that carries only CV fold validation blocks (no
  aggregate, no refit; e.g. converted legacy predictions) is shown as validation
  evidence. Since 0.5.1 its fold was presented as a hidden training
  resubstitution score and the Results Inspector offered no evaluation score.
- The smoke runner resolves the cross-runtime prerequisites (ecosystem E2E
  artifacts, Python oracle) from the workspace, including from a Git worktree,
  instead of failing a plain local run on unset variables.
- A run is never fitted on held-out test samples. A run view with test samples
  and no train sample (for example after removing every train sample with
  missing spectral values, or a test-only upload) used to fall back to fitting,
  cross-validating and scoring on the test samples; it is now refused with an
  explanation.
- Replacing missing spectral values also works for a single table that holds
  spectra and targets together (nirs4all-io `mixed` source); it used to replace
  nothing there and report a wrong reason.

### Changed

- Final tested cohort: Methods 1.5.1, DAG-ML 0.5.0, DMD 0.2.17, Core 0.6.1,
  IO 0.3.8 and the public Datasets 0.3.23 origin-plan module. The earlier
  dependency adoptions below record intermediate development states.

- Consume nirs4all-io 0.3.6 (partial multi-target matrices with targets missing
  on different rows; case-insensitive NA tokens), DAG-ML 0.4.3 and Core 0.5.1,
  with exact published acquisition receipts. The io browser payload is the
  owner's v0.3.6 release build; DMD 0.2.16, Formats 0.2.17, Datasets 0.3.18 and
  Methods 1.3.18 are unchanged.
- Consume DAG-ML 0.4.4 and Methods 1.3.19 (Methods ABI 2.23 unchanged), with
  exact published acquisition receipts. Their user-facing error messages no
  longer say "preflight"; nothing else changes. Core 0.5.1 peer ranges already
  accept both.
- Consume the published Methods 1.4.0 (ABI 2.24.0: model importances, affine
  pipeline coefficients, gradient explanations, near-zero scale guard) and
  nirs4all-ui 0.3.0 (importance comparison charts, spreadsheet-friendly CSV)
  with exact registry acquisition receipts, replacing the local unpublished
  builds labelled Methods 1.3.19+local and nirs4all-ui 0.2.7-importance.2.
  Core 0.5.1 (`@nirs4all/methods ^1.3.0`) and DAG-ML 0.4.4 (`^1.2.0`) peer
  ranges accept Methods 1.4.0.

## 0.5.2 — 2026-11-16

### Fixed

- Apply the canonical nirs4all.org visual theme from nirs4all-ui: warm paper,
  spectral grid, teal controls and shared surface/typography tokens.
- Replace manifest-only multimodal import with the reusable shared Dataset
  Builder: Source, Role, Columns and Validation. Inspect files with IO/Formats,
  edit source roles, sample IDs, features and axes, validate alignment, then explicitly
  create the dataset. A JSON manifest is optional.
- Invalidate import validation after any draft edit; preserve the active dataset
  and its results when inspection or materialization refuses the new collection.

### Changed

- Consume the exact published nirs4all-ui 0.2.4 archive in both Web hosts and
  qualify the complete Dataset Builder interaction path before Pages deployment.

## 0.5.1 — 2026-11-16

### Added

- A separate `/nirs4all_multimodale/` teaching laboratory, linked from the Web
  workbench, with Raman/NIRS/MIR, NIRS/genetics and NIRS/image collections.
- Local identity-aligned CSV/VCF/PNG import, linked source exploration and
  source-specific preprocessing. Deterministic CC0 examples include editable
  import manifests and an offline generator in the Python SDK examples.
- Single-source, early, centered-block equal-super-weight MBPLS, fixed-mean
  late, nested OOF stacking, hybrid, jointly trained network and network-stacking
  comparisons. Native DAG owns folds, scoring and fitted replay; Methods owns
  numerics, including the trainable convolution/dense branches.
- Explicit OOF/held-out scopes, biological groups, prediction/residual tables,
  run provenance, configuration/result downloads and worker cancellation.
  Downloads document experiments; they are not executable model bundles.

### Changed

- Consume Methods 1.3.17 (ABI 2.22.0), Formats 0.2.17, IO 0.3.3, DAG 0.4.2 and
  shared UI 0.2.3 with exact public acquisition receipts. Retain Core 0.5.0,
  DMD 0.2.16 and Datasets 0.3.18.
- Qualify the three-case native browser comparison before Pages deployment.

## 0.5.0 — 2026-11-03

### Added

- Run Cartesian pipeline generators with complete alternative subchains, continue
  past identified estimator-fit refusals in both native and host CV, and show each
  successful variant’s full pipeline and parameters. Progress covers the whole search.
- Curated browser-ready Studio preset cards.

### Fixed

- Resolve single-choice sweeps on both native and host CV paths, and report the
  fitted parameters in outer generator summaries.
- Preserve Float64Array NaN values from IO, including missing categorical targets.
  Keep unlabelled rows at load and prediction; native DAG FoldSets record missing
  training targets and exclude them from fitting, validation and scoring.
- Refresh Datasets metadata and distributed license texts to the dual license
  `CECILL-2.1 OR AGPL-3.0-or-later`.

### Changed

- Consume Core 0.4.7, DAG 0.3.44, DAG Data 0.2.16, IO 0.2.14, Methods 1.3.14,
  Formats 0.2.14, Datasets 0.3.18 and shared UI 0.2.1. Verify exact published
  tarball integrity, staged file hashes and source provenance. Browser-only
  provider/Datasets bindings are built from pinned release sources.
- Refresh the catalog from the staged Methods runtime (ABI 2.20.0).
- Stop generator searches on runtime or contract failures and keep overall progress
  monotonic through selection, including searches with six or more candidates.

## 0.4.3 — 2026-11-02

### Fixed

- The Presets dialog opens runnable presets again. Since 0.4.2 only one Studio
  variant could be opened; the others only offered a recipe download. A new
  "Ready to run in the browser" section lists the Studio presets built from n4m
  nodes, with the same preprocessing search, cross-validation and models, minus
  the models the browser cannot run (random forests, extra trees, gradient
  boosting, LightGBM, XGBoost, TabPFN, NICON, OPLS). The Web engine runs one model
  per pipeline, so a multi-model Studio preset appears once per compatible model;
  Studio tuning ranges become small explicit grids.

## 0.4.2 — 2026-11-02

### Fixed

- Missing targets no longer reach calibration as zero. The dag-ml-data target
  table carried a missing target (`NaN`) as JSON `null`, which was read back as
  `0`, so unlabelled samples were fitted, cross-validated and scored as y = 0.
  Rows without a target are now marked `excluded` in the sample relations, kept
  out of fitting, CV, scoring and split operators, and still predicted. The run
  reports how many were excluded.
- A missing label (`NA`, `N/A`, `NaN`, `null`, `none`, empty) is not a class: a
  regression target with `NA` cells stays a regression, and classification never
  creates an `NA` class or maps a missing label to the first class.
- Datasets with repeated sample identifiers (replicate scans) load again. Web
  0.4.0 required unique sample ids and refused them; only internal row
  identities need to be unique, and the original ids stay visible.
- `Xval` / `Yval` / `Mval` files (the NIRS cal/val naming) are read as the
  held-out test partition instead of being silently dropped.

### Added

- Opt-in repetition column in Configure dataset (`repetition`, as in the Python
  library), default none. When set, cross-validation keeps every scan of a
  physical sample in the same fold; the grouping is scoped per partition, so a
  sample code reused between cal and val sets is not linked. A repetition column
  inferred by nirs4all-io is never applied without the user's choice.

### Changed

- The Presets gallery shows the ten Studio default pipelines from the shared
  `nirs4all-ui` 0.1.17 catalogue, imports a recipe only when the browser runtime
  can represent it, and offers the original recipe for download otherwise.
- The Predict panel exports predictions as CSV (regression values,
  classification labels, multi-target matrices with sample ids).

## 0.4.0 — 2026-10-04

- Run selected full refit and prediction through DAG-ML, binding the browser
  composite carrier to the native predictor artifact and retaining its lineage.
  Preprocessing and feature-branch CV keep their declared browser host execution
  on native folds.
- Preserve group, origin and repetition identities from CSV datasets. Run grouped
  cross-validation through the native scheduler and exclude augmented observations
  from out-of-fold and evaluation scores.
- Qualify concrete pipeline replay, held-out predictions and exported archives
  against the public Python API. General multi-source selection UI and its V2
  writer remain deferred.
- Stage DAG-ML 0.3.34, Core 0.4.1, IO 0.2.4 and Methods 1.3.2 (ABI 2.17),
  retaining exact source and binary provenance. Core uses the public npm package;
  IO uses the verified release source build.
- Qualification passes 287 unit tests, all 32 browser smokes, both builds and the
  public custom-host smoke. Python comparisons use the installed public SDK 1.4.0
  wheel with the five public upstream wheels. Performance fixture timings retain
  their historical provenance.

## 0.3.1 — 2026-09-27

### Fixed

- Column identity at predict (re-audit R09 / F03). A model fitted on a dataset with a spectral
  axis or header names now records its input columns in order (names, axis, unit) in the fitted
  pipeline and in the `.n4a` bundle. Predicting a CSV whose header names differ from the model's
  (other names, other order, other count) is refused with the first mismatch, instead of
  accepting a same-width permutation. When the fitted chain is native (N4ME transformers /
  selectors and an N4ME model), the libn4m backend replays it as one Methods `RolePipeline`
  holding the fitted names, so libn4m checks them too. A file without a header row, and a model
  without recorded columns (index axis, bundles from 0.3.0 and earlier), are taken by position;
  the Predict panel says so. Column names containing NUL are refused.
- CSV datasets: test spectra whose header differs from the training spectra header are refused,
  and a non-numeric header now names the columns.

### Changed

- Stages `@nirs4all/methods` 1.2.1 (ABI 2.14.0 unchanged), rebuilt reproducibly from the v1.2.1
  tag and byte-identical to the published npm tarball. It carries the Methods re-audit fixes:
  every estimator input view is validated (layout, float64) before dispatch, a role pipeline
  predicting zero rows returns an empty output, the `RolePipeline` facade applies the shared
  label contract (exact numeric labels, validated class-name tables) and refuses column names
  containing NUL at fit, import and predict.
