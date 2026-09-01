# Vendored Core Archive V2 payload

This directory stages the real npm payload produced from `nirs4all-core` commit
`7c3ed3fdaeec7dd01ee2a99a8b72bfa378676d66`.

- Package: `nirs4all@0.3.22`
- Qualified tarball SHA-256:
  `1869c1957db6419b7a269aa11896e7561ca4cb1092b8e2de7381a218cf3296d6`
- Native Rust/WASM SHA-256:
  `6eb1f28ff00641415104411284029f7c49f85f612d15b70d776cf5a79edb1d82`
- Archive V2 JavaScript surface SHA-256:
  `d0fe44eea7f4454d7e34febb6a33ae8f69cb1af92bc978bcbaef924ec109a0ce`

`scripts/sync-core-shim.mjs` copies text surfaces from the selected Core source
and pins every generated `native/` file by SHA-256 when the sibling checkout has
not built wasm-pack output. Build outputs, Cargo targets and caches are excluded.
