# Vendored Core Archive V2 payload

This directory stages the real npm payload produced from `nirs4all-core` commit
`94d712f60848df60ce6fa90f006ada09767cfd08` (tree
`e1444766493d235d13cbdf53bf7e80371a43a525`).

- Package: `nirs4all@0.3.25`
- Qualified tarball SHA-256:
  `e794accfc3010cdf04f5033f1066dad5a245ee76791b2871b23f308efb974445`
- Native Rust/WASM SHA-256:
  `ab4a2ce8c52bc304cb91e22a19549fc643326cb8a816ba03f414730a7cf44fa0`
- Archive V2 JavaScript surface SHA-256:
  `69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4`

`scripts/sync-core-shim.mjs` copies text surfaces from the selected Core source
and checks the complete 21-file package inventory by SHA-256, including every
generated `native/` file and all licensing notices. The pinned package is still
verified when no sibling checkout is present. Build outputs, Cargo targets and
caches are excluded.
