#!/usr/bin/env bash
# Build/stage the WebAssembly packages studio-lite consumes into src/engine/wasm/.
#
#   formats  : nirs4all-formats (vendor-format decode, ~58 families)   [wasm-pack --target web]
#   io       : nirs4all-io      (dataset inference + DatasetSpec)       [wasm-pack --target web]
#   methods  : @nirs4all/methods-wasm (libn4m PLS engine)              [prebuilt dist, copied]
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

build_pack() {  # <crate-dir> <out-name>
  local crate="$1" name="$2"
  if [ -d "$crate" ]; then
    echo "▶ building $name ($crate)"
    "$WASM_PACK" build "$crate" --target web --release --out-dir "$OUT/$name"
  else
    echo "⚠ skip $name — $crate not found"
  fi
}

mkdir -p "$OUT"
build_pack "$ECO/nirs4all-formats/bindings/wasm" formats
build_pack "$ECO/nirs4all-io/bindings/wasm" io

echo "▶ staging methods (@nirs4all/methods-wasm prebuilt dist)"
METHODS="$ECO/nirs4all-methods/bindings/js/dist"
if [ -d "$METHODS" ]; then
  mkdir -p "$OUT/methods"
  cp "$METHODS"/*.js "$METHODS"/*.d.ts "$METHODS"/n4m.wasm "$OUT/methods/"
else
  echo "⚠ skip methods — $METHODS not found (run: cd $ECO/nirs4all-methods && cmake --preset emscripten && cmake --build --preset emscripten --target pls4all_wasm)"
fi

build_pack "$ECO/dag-ml/crates/dag-ml-wasm" dagml   # compile/validate the pipeline DSL (planning layer)
# Deepening (WS1): dag-ml-wasm execute_* exports wrapping the SequentialScheduler +
# dag-ml-data-wasm `provider` feature would let dag-ml *execute* in-browser too:
#   "$WASM_PACK" build "$ECO/dag-ml-data/crates/dag-ml-data-wasm" --target web --release \
#       --out-dir "$OUT/dagml-data" -- --features provider
echo "✓ WASM staged into $OUT (formats · io · methods · dag-ml; dag-ml scheduler execution = roadmap)"
