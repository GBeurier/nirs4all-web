# Changelog

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
