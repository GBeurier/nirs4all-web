# Vendored Core Archive V2 payload

This directory stages the real npm payload produced from `nirs4all-core` commit
`e0f5d485eae4279f02d58fe82fad3946202e463f` (tree
`3fd59b96fc5728088c6d1d207e783d826f87401f`).

- Package: `nirs4all@0.3.25`
- Qualified tarball SHA-256:
  `e6feeaa766a252ecaba7be78c4bff6e693839a72230ee070a77b22bed4e2aaa7`
- Native Rust/WASM SHA-256:
  `629e84f92b2c3e3119a5d1924d0507b1be17e045961bdae39d58c7b7e5a7bed8`
- Archive V2 JavaScript surface SHA-256:
  `69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4`

`scripts/sync-core-shim.mjs` copies text surfaces from the selected Core source
and checks the complete 21-file package inventory by SHA-256, including every
generated `native/` file and all licensing notices. The pinned package is still
verified when no sibling checkout is present. Build outputs, Cargo targets and
caches are excluded.
