# Vendored Core Archive V2 payload

This directory stages the real npm payload produced from `nirs4all-core` commit
`46a51a4bf123f9766b363fcbfb3009ea5c5f0a62` (tree
`3b02332cfa4cf5e3424a7697f56d85a55fd80de6`).

- Package: `nirs4all@0.3.25`
- Qualified tarball SHA-256:
  `1e08637a7d026e4dc6fa530204ef5dc34362e76cab0f3722ef94d5bb7acf4dba`
- Native Rust/WASM SHA-256:
  `41f0a5304b76b94a573caac86de42667cbc8c8e60dcf59e351c8e8ffe708f482`
- Archive V2 JavaScript surface SHA-256:
  `69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4`

`scripts/sync-core-shim.mjs` copies text surfaces from the selected Core source
and checks the complete 21-file package inventory by SHA-256, including every
generated `native/` file and all licensing notices. The pinned package is still
verified when no sibling checkout is present. Build outputs, Cargo targets and
caches are excluded.
