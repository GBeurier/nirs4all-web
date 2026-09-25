# Vendored nirs4all JavaScript/WASM payload

This directory stages the `nirs4all@0.3.32` npm package built from
`nirs4all-core` commit `57e372202989becb77f3b706b7ab9a5f0014e9f7`
(tree `57202cc8b0430ad16a68d51926ce0014c7181de4`).

- Local qualified tarball SHA-256:
  `8e28bf41ca7afa8c36b63c989fb3b316065d29960d3bd985082a04f31b8fd4ea`
- Native Rust/WASM SHA-256:
  `66c39cdde1482203800518b614fb16fa3dce3bc4f02197cc71778c98b24a4d0a`
- Archive V2 JavaScript surface SHA-256:
  `69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4`

The package was built with the Core `prepack` hook, passed its strict Methods
parity suite, and was installed in an isolated smoke host. The vendored
`package.json` adds npm public/provenance metadata to match the release
workflow. `scripts/sync-core-shim.mjs` checks the source commit/tree and the
complete package inventory by SHA-256, including every generated `native/`
file and all licensing notices. The public registry tarball must be checked
separately after publication.
