# Changelog

## 0.4.0 — Unreleased

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
  public custom-host smoke. Python comparisons use the local SDK 1.4.0 release
  candidate with five public upstream wheels; SDK public-wheel identity and its
  installed cohort are verified separately before deployment. Performance fixture
  timings retain their historical provenance.

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
