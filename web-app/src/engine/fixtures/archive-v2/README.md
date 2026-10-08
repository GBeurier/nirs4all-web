# Archive V2 multi-target qualification fixture

`multitarget-pls.n4a` is the current stored-ZIP Archive V2 transport produced by
public DAG-ML 0.3.41 (`6f4044b45028a90a92d3f29287e67779bb5fd0b9`) through
`build_archive_v2_native_portable_payloads_json`, then persisted and validated
through public Core 0.4.5 (`5668796aaac9a02d8d0146ec05ead04f9c76657c`).

The original training outcome, portable predictor package and all seven payload
members are byte-identical to the historical fixture qualified by Core
`7c3ed3fdaeec7dd01ee2a99a8b72bfa378676d66`. No model was refitted. The actual
current producer adds only the previously absent manifest field
`payloads.methods.n4mm[0].abi_min_minor = 0`. The unchanged 352-byte N4MM model
has SHA-256 `4c4aead1e669235595970ee40530315d02c2dad80a72845c6930424d1580edc4`.
Actual Methods 1.3.4 WASM replay preserves all four numerical cells below exactly.

The original transport remains byte-for-byte as `multitarget-pls-dag023.n4a`
(SHA-256 `994252030ff80129d0431995bae53eb473082f05825b65714379262b72af13fa`).
The negative test pins those historical bytes and requires the current Core
validator to refuse their incomplete semantic closure. The format-2 companion
below is unchanged.

- Current SHA-256: `3a3ff44c6cb33579b561ef68008dbc04157ee0f779133de6b7fc3d67082210cf`
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
