# Vendored Core Archive V2 payload

This directory stages the real npm payload produced from `nirs4all-core` commit
`89787477bd7883ceb26b51fa3228bca13db85f6e` (tree
`7d748e79e4bef0da2a0803f9a0dd8984e28a46bb`).

- Package: `nirs4all@0.3.27`
- Qualified tarball SHA-256:
  `dd55134aa9439ac4ac194bbcd7b5aa3ac5364de789672546c64e76cf4500b177`
- Native Rust/WASM SHA-256:
  `ace0b9079d98f6411bf02a483ea27f0767b6a1ebb1415740e31b12a892a80f44`
- Archive V2 JavaScript surface SHA-256:
  `69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4`

The public registry tarball was fetched twice independently and both copies had
the qualified SHA-256 above. `scripts/sync-core-shim.mjs` checks the exact
source commit/tree plus the complete 21-file public package inventory by
SHA-256, including every generated `native/` file and all licensing notices.
Build outputs, Cargo targets and caches are excluded.
