# Archive V2 multi-target qualification fixture

`multitarget-pls.n4a` is the canonical stored-ZIP Archive V2 fixture produced
and qualified by `nirs4all-core` commit
`7c3ed3fdaeec7dd01ee2a99a8b72bfa378676d66`.

- SHA-256: `994252030ff80129d0431995bae53eb473082f05825b65714379262b72af13fa`
- Model: one multi-target Methods N4MM PLS final refit
- Targets: `protein`, `moisture`
- Replay input: `[[1.5, 0.5], [3.5, 1.5]]`
- Expected row-major output:
  `[1.6363636363636365, 13.272727272727273, 2.4999999999999996, 15]`

The fixture is copied byte-for-byte. Web must pass it to Core's Rust/WASM
validator and Methods replay surface; it must not parse or rebuild the archive.

`snv-savgol-pls.n4a` is the exact content-bound format-2 companion assembled
through DAG-ML `6800c4fd0ec8b13b171cec9ed4a9b2ccdbabca0d`, persisted through Core
`94d712f60848df60ce6fa90f006ada09767cfd08`, and fitted/inspected through
Methods `48ad1e5a50844f68c2b99e93b02ad6a3b491c07b` (ABI 2.5).

- SHA-256: `ccac47faeeca1d8de493245182bc4a4375d3c487f60f2bfb2b108bddd2339498`
- Pipeline: SNV (`axis=1`, `ddof=0`, mean/std enabled), then Savitzky-Golay
  smooth (`window=3`, `poly=2`, `deriv=0`, `delta=1`, `mode=interp`, `cval=0`),
  then one-component multi-target PLS
- Native pipeline fingerprint: `0293f3863dfaa292` (`fnv1a64.v1`)
- Replay input: `[[2, 3, 5], [7, 11, 16]]`
- Expected row-major output:
  `[1.352456259978931, 11.528684389968399, 5.764743613179501, 18.14711541976925]`

The fixture deliberately exercises raw-feature replay: Web supplies the 3-wide
input unchanged and the imported N4MM v2 model owns both preprocessing steps.
