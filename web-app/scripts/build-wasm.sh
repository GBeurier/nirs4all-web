#!/usr/bin/env bash
# Stage the current authenticated public npm cohort; no native rebuild.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$HERE/sync-core-shim.mjs"
for component in formats io datasets methods dagml dagml-data; do
  node "$HERE/stage-$component-wasm.mjs"
done
node "$HERE/sync-component-legal.mjs"
