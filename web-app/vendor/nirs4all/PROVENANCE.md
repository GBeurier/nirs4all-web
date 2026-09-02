# Vendored Core Archive V2 payload

This directory stages the real npm payload produced from `nirs4all-core` commit
`4eb8a687b0b3797b6f5db816444cf840f67c8ee0` (tree
`4ccd67a7fe556db2c50615500cca096cae7666ef`).

- Package: `nirs4all@0.3.25`
- Qualified tarball SHA-256:
  `9dfb9c35f4e3b8ce7ecd7712ff2cd54330861bb48f95c32ce68c87133369c77f`
- Native Rust/WASM SHA-256:
  `6781d37229498004ad1b3274fe0cdf663c62af738965458ae3b7811c48062b3f`
- Archive V2 JavaScript surface SHA-256:
  `edbd4e1d2ed7dec2b62e128756d533feea2df0b99a0e5a2c83c41a660056f6b2`

`scripts/sync-core-shim.mjs` copies text surfaces from the selected Core source
and checks the complete 21-file package inventory by SHA-256, including every
generated `native/` file and all licensing notices. The pinned package is still
verified when no sibling checkout is present. Build outputs, Cargo targets and
caches are excluded.
