# Vendored nirs4all JavaScript/WASM payload

This directory stages the public `nirs4all@0.3.33` npm tarball published from
`nirs4all-core` commit `204517482f99c017fbc8210bd1eed5c8c13a0f3e`
(tree `80f868f66a765458c650af612347c850fea070ba`).

- Public registry tarball SHA-256:
  `8290fe6e73a58f2c3a451ad1b209403f677461b1eef5ecffde57311c240f903e`
- npm `dist.integrity`:
  `sha512-hyH/d8y+cMcy8okPt3q2kLzCCOvevQkwOJdx+BkIz1UBDNnPpzHOu0I0z2Tfb5DCrZnVto5fhgqnyjOBBkfFHw==`
- Published Rust/WASM SHA-256:
  `b4f15573714f6de1eb24d04eb1fb498e2d492563ef117c8a9060a9bb44b14911`
- Archive V2 JavaScript surface SHA-256:
  `69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4`

The package passed the Core strict Methods parity gate before publication and
carries signed GitHub Actions provenance. The registry tarball was downloaded
and verified against npm's SHA-512 integrity before staging. Every staged file
is pinned by SHA-256 in `scripts/sync-core-shim.mjs`; the source commit/tree and
JavaScript/TypeScript source files are checked when that checkout is available.
