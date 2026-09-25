# Vendored nirs4all JavaScript/WASM payload

This directory stages the public `nirs4all@0.3.32` npm tarball published from
`nirs4all-core` commit `57e372202989becb77f3b706b7ab9a5f0014e9f7`
(tree `57202cc8b0430ad16a68d51926ce0014c7181de4`).

- Public registry tarball SHA-256:
  `4daf17413a3b2501bbe4ae13ef6cdf5fce0898b71f096af4e2a7bdb825159be5`
- npm `dist.integrity`:
  `sha512-OMQIbn9m2R0H45KbmaLjyJbvXIdhaS/2L92OxRbZMtGEEHCRKtWel6B6ZapYVEBoQ3OlAfyfBC4MeNW4wFlpIg==`
- Published Rust/WASM SHA-256:
  `b4f15573714f6de1eb24d04eb1fb498e2d492563ef117c8a9060a9bb44b14911`
- Archive V2 JavaScript surface SHA-256:
  `69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4`

The package passed the Core strict Methods parity gate before publication and
carries signed GitHub Actions provenance. The registry tarball was downloaded
and its complete inventory was compared with the locally qualified package;
only the generated Rust/WASM binary differed between build environments. This
vendor directory uses the published binary. `scripts/sync-core-shim.mjs` checks
the source commit/tree, source JS files, and every published package file by
SHA-256, including the generated binary and licensing notices.
