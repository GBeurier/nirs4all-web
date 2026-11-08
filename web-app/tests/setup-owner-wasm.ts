import { readFileSync } from 'node:fs'
import { initSync as initFormats } from '../src/engine/wasm/formats/nirs4all_formats_wasm.js'
import { initSync as initIo } from '../src/engine/wasm/io/nirs4all_io_wasm.js'

// Node cannot fetch file URLs. Initialize the same staged module instances used
// by Core's package aliases before application imports can cache a failed load.
initFormats({ module: readFileSync(new URL('../src/engine/wasm/formats/nirs4all_formats_wasm_bg.wasm', import.meta.url)) })
initIo({ module: readFileSync(new URL('../src/engine/wasm/io/nirs4all_io_wasm_bg.wasm', import.meta.url)) })
