# JavaScript/WASM Binding

npm package name: `nirs4all`

The canonical source repository is `nirs4all-core`; the npm publication keeps
the bare `nirs4all` name because the lite->core rename applies only to the
Python distribution.

This package is the runtime surface that `nirs4all-web` should consume. The web
application lives in `nirs4all-web`; this directory is for the reusable
JavaScript/WASM binding and package metadata.

The portable execution API delegates Kennard-Stone, SNV, Savitzky-Golay, and
PLS component sweeps to `@nirs4all/methods-wasm`:

- `runPortablePipeline(source, dataset)` parses the shared nirs4all JSON/YAML
  syntax, executes the portable subset, and returns parity-checkable split,
  target, variant, and selected-result fields plus a serialized selected PLS
  model.
- `predictPortablePipeline(result, dataset)` replays the recorded preprocessing
  chain and predicts with that serialized model through the same methods WASM
  backend.

Savitzky-Golay defaults to `mode: "interp"` for full nirs4all parity and
preserves explicit methods-backed modes (`mirror`, `constant`, `nearest`,
`wrap`, `interp`) plus `cval` in the serialized preprocessing chain.
