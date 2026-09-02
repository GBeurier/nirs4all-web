#!/usr/bin/env bash
# Build/stage the WebAssembly packages web-app consumes into src/engine/wasm/.
#
#   formats  : nirs4all-formats (vendor-format decode, ~58 families)   [wasm-pack --target web]
#   io       : nirs4all-io      (dataset inference + DatasetSpec)       [wasm-pack --target web]
#   methods  : @nirs4all/methods (libn4m PLS engine)                   [prebuilt dist, copied]
#   dag-ml*  : dag-ml + dag-ml-data execution                          [WS1 — execute_* exports pending]
#
# Toolchain is not on the default PATH here; we add nvm node, cargo, and emsdk.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(cd "$HERE/.." && pwd)"
ECO="$(cd "$APP/../.." && pwd)"   # the nirs4all ecosystem working tree
OUT="$APP/src/engine/wasm"

export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$HOME/.cargo/bin:$PATH"
# emsdk provides emcc/emar for the zstd C shim used by the Parquet reader
[ -f "$HOME/emsdk/emsdk_env.sh" ] && source "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1 || true
if command -v emcc >/dev/null 2>&1; then
  export CC_wasm32_unknown_unknown="$(command -v emcc)"
  export AR_wasm32_unknown_unknown="$(command -v emar)"
  export CRATE_CC_NO_DEFAULTS=1
fi

WASM_PACK="$(command -v wasm-pack || echo "$HOME/.cargo/bin/wasm-pack")"

mkdir -p "$OUT"
if [ -d "${NIRS4ALL_FORMATS_ROOT:-$ECO/nirs4all-formats}/bindings/wasm" ]; then
  echo "▶ building and proving formats"
  NIRS4ALL_FORMATS_ROOT="${NIRS4ALL_FORMATS_ROOT:-$ECO/nirs4all-formats}" \
    WASM_PACK_BIN="$WASM_PACK" node "$HERE/stage-formats-wasm.mjs"
else
  echo "✗ formats crate not found" >&2
  exit 1
fi
if [ -d "${NIRS4ALL_IO_ROOT:-$ECO/nirs4all-io}/bindings/wasm" ]; then
  echo "▶ building and proving io"
  NIRS4ALL_IO_ROOT="${NIRS4ALL_IO_ROOT:-$ECO/nirs4all-io}" \
    WASM_PACK_BIN="$WASM_PACK" node "$HERE/stage-io-wasm.mjs"
else
  echo "✗ required io crate not found" >&2
  exit 1
fi

if [ -d "${NIRS4ALL_DATASETS_ROOT:-$ECO/nirs4all-datasets}/bindings/wasm" ]; then
  echo "▶ building and proving datasets"
  NIRS4ALL_DATASETS_ROOT="${NIRS4ALL_DATASETS_ROOT:-$ECO/nirs4all-datasets}" \
    WASM_PACK_BIN="$WASM_PACK" node "$HERE/stage-datasets-wasm.mjs"
else
  echo "✗ required datasets crate not found" >&2
  exit 1
fi

echo "▶ staging methods (@nirs4all/methods V1 prebuilt dist)"
METHODS="$ECO/nirs4all-methods/bindings/js/dist"
if [ -d "$METHODS" ]; then
  mkdir -p "$OUT/methods"
  cp "$METHODS"/*.js "$METHODS"/*.d.ts "$METHODS"/n4m.wasm "$OUT/methods/"
else
  echo "✗ required Methods artifact not found: $METHODS" >&2
  echo "  run: cd $ECO/nirs4all-methods && cmake --preset emscripten && cmake --build --preset emscripten --target pls4all_wasm" >&2
  exit 1
fi

if [ -d "${NIRS4ALL_DAG_ML_ROOT:-$ECO/dag-ml}/crates/dag-ml-wasm" ]; then
  echo "▶ building and proving dag-ml"
  NIRS4ALL_DAG_ML_ROOT="${NIRS4ALL_DAG_ML_ROOT:-$ECO/dag-ml}" \
    WASM_PACK_BIN="$WASM_PACK" node "$HERE/stage-dagml-wasm.mjs"
else
  echo "✗ required dag-ml crate not found" >&2
  exit 1
fi

# dag-ml-data provider: the typed data-contract layer. The `provider` feature
# compiles WasmInMemoryProvider (materialize / make_view / feature_block /
# target_block) into the wasm so the browser can serve X/y by sampleId.
if [ -d "${NIRS4ALL_DAG_ML_DATA_ROOT:-$ECO/dag-ml-data}/crates/dag-ml-data-wasm" ]; then
  echo "▶ building and proving dagml-data (provider feature)"
  NIRS4ALL_DAG_ML_DATA_ROOT="${NIRS4ALL_DAG_ML_DATA_ROOT:-$ECO/dag-ml-data}" \
    WASM_PACK_BIN="$WASM_PACK" node "$HERE/stage-dagml-data-wasm.mjs"
else
  echo "✗ required dag-ml-data crate not found" >&2
  exit 1
fi
echo "✓ WASM staged into $OUT (formats · io · datasets · methods · dag-ml · dag-ml-data)"
