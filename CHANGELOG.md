# Changelog

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
