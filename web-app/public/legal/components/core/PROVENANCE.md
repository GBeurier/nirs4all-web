# Vendored Core Archive V2 payload

This directory stages the real npm payload produced from `nirs4all-core` commit
`3a3ce728cebf001ad25b20b3eeaed3bc76daf32f` (tree
`57e8203bf33a6c7b0b3f049f0dcbf3efa28991b1`).

- Package: `nirs4all@0.3.25`
- Qualified tarball SHA-256:
  `f1f7d0f354e01980dd553d6edb48125c43d77a1e35561ba0ed955fd4f588bcf1`
- Native Rust/WASM SHA-256:
  `26fdff4c1ecf2a30d4dfbdadb5ac88617654e47931a53b8499165175afde5edf`
- Archive V2 JavaScript surface SHA-256:
  `ed0d81ebdad7f2b93e040222589e464a9c87f591b705cad295cdbc9eeee0b6eb`

`scripts/sync-core-shim.mjs` copies text surfaces from the selected Core source
and checks the complete 21-file package inventory by SHA-256, including every
generated `native/` file and all licensing notices. The pinned package is still
verified when no sibling checkout is present. Build outputs, Cargo targets and
caches are excluded.
