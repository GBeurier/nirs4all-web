# Vendored nirs4all JavaScript/WASM payload

This directory stages the public `nirs4all@0.3.34` npm tarball published from
`nirs4all-core` commit `1bd963198624531d7658ec17c27a992d75f5133d`
(tree `7c8718ffd95041dc2f8c83874e735e5e288a9c53`).

- Public registry tarball SHA-256:
  `883f9a2796bfdba962c80ef88cffe00e9c026dd4cbbcd6f79f963a5cb9abf1dc`
- npm `dist.integrity`:
  `sha512-B7dGF7xr6PTuS3x/Et5BQ2a5Rqm0YcmuIKeVk+WIOZTIly1Nq/Al3iQqyqEQHIZG8MKs49DtNZIQjidy0WSOYQ==`
- Published Rust/WASM SHA-256:
  `b4f15573714f6de1eb24d04eb1fb498e2d492563ef117c8a9060a9bb44b14911`
- Archive V2 JavaScript surface SHA-256:
  `69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4`

The package passed the Core strict Methods parity gate before publication and
carries signed GitHub Actions provenance. The registry tarball was downloaded
and verified against npm's SHA-512 integrity before staging. Every staged file
is pinned by SHA-256 in `scripts/sync-core-shim.mjs`; the source commit/tree and
JavaScript/TypeScript source files are checked when that checkout is available.
