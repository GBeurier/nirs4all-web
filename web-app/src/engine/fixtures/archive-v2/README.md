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
