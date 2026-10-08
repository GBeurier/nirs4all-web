#!/usr/bin/env bash
# Build/stage the WebAssembly packages web-app consumes into src/engine/wasm/.
#
#   formats  : pinned public Formats Pages Web package               [no local rebuild]
#   io       : nirs4all-io      (dataset inference + DatasetSpec)       [wasm-pack --target web]
#   methods  : pinned public @nirs4all/methods npm payload             [no local rebuild]
#   dag-ml   : pinned published npm WASM (no local native rebuild)
#   dag-ml-data: typed provider runtime                               [wasm-pack --target web]
#
# Builds are required only for the browser IO/Datasets glue and Data provider.
# Keep caller-selected Node; add Cargo when it is outside the default PATH.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(cd "$HERE/.." && pwd)"
ECO="$(cd "$APP/../.." && pwd)"   # the nirs4all ecosystem working tree
OUT="$APP/src/engine/wasm"

if [ -z "${NIRS4ALL_DAG_ML_NPM_TARBALL:-}" ] || [ -z "${NIRS4ALL_DAG_ML_NPM_METADATA:-}" ]; then
  echo "✗ capture the pinned public dag-ml npm tarball and version metadata, then set NIRS4ALL_DAG_ML_NPM_TARBALL and NIRS4ALL_DAG_ML_NPM_METADATA" >&2
  exit 1
fi

export PATH="$HOME/.cargo/bin:$PATH"

WASM_PACK="$(command -v wasm-pack || echo "$HOME/.cargo/bin/wasm-pack")"

mkdir -p "$OUT"
if [ -z "${NIRS4ALL_FORMATS_PAGES_CAPTURE_DIR:-}" ] || [ -z "${NIRS4ALL_FORMATS_DEPLOYMENT_CAPTURE_DIR:-}" ]; then
  echo "✗ provide the pinned public Formats Pages files and deployment captures" >&2
  exit 1
fi
echo "▶ staging pinned public formats"
node "$HERE/stage-formats-wasm.mjs"
if [ -d "${NIRS4ALL_IO_ROOT:-$ECO/nirs4all-io}/bindings/wasm" ]; then
  echo "▶ building browser io once"
  NIRS4ALL_IO_ROOT="${NIRS4ALL_IO_ROOT:-$ECO/nirs4all-io}" \
    WASM_PACK_BIN="$WASM_PACK" node "$HERE/stage-io-wasm.mjs"
else
  echo "✗ required io crate not found" >&2
  exit 1
fi

if [ -d "${NIRS4ALL_DATASETS_ROOT:-$ECO/nirs4all-datasets}/bindings/wasm" ]; then
  echo "▶ building browser datasets once"
  NIRS4ALL_DATASETS_ROOT="${NIRS4ALL_DATASETS_ROOT:-$ECO/nirs4all-datasets}" \
    WASM_PACK_BIN="$WASM_PACK" node "$HERE/stage-datasets-wasm.mjs"
else
  echo "✗ required datasets crate not found" >&2
  exit 1
fi

if [ -z "${NIRS4ALL_METHODS_NPM_TARBALL:-}" ] || [ -z "${NIRS4ALL_METHODS_NPM_METADATA:-}" ]; then
  echo "✗ provide the pinned public Methods npm tarball and version metadata" >&2
  exit 1
fi
echo "▶ staging pinned public methods"
node "$HERE/stage-methods-wasm.mjs"

echo "▶ staging pinned published dag-ml"
node "$HERE/stage-dagml-wasm.mjs"

# dag-ml-data provider: the typed data-contract layer. The `provider` feature
# compiles WasmInMemoryProvider (materialize / make_view / feature_block /
# target_block) into the wasm so the browser can serve X/y by sampleId.
if [ -d "${NIRS4ALL_DAG_ML_DATA_ROOT:-$ECO/dag-ml-data}/crates/dag-ml-data-wasm" ]; then
  echo "▶ building browser dagml-data once (provider feature)"
  NIRS4ALL_DAG_ML_DATA_ROOT="${NIRS4ALL_DAG_ML_DATA_ROOT:-$ECO/dag-ml-data}" \
    WASM_PACK_BIN="$WASM_PACK" node "$HERE/stage-dagml-data-wasm.mjs"
else
  echo "✗ required dag-ml-data crate not found" >&2
  exit 1
fi
node "$HERE/sync-component-legal.mjs"
echo "✓ WASM staged into $OUT (formats · io · datasets · methods · dag-ml · dag-ml-data)"
