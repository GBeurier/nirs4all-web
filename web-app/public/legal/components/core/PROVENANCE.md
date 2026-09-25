# Vendored nirs4all JavaScript/WASM payload

This directory stages the public `nirs4all@0.3.35` npm tarball published from
`nirs4all-core` commit `430edfcced7b34cb91fdc54099f2ac4427614884`
(tree `955ff21c514d961d55ae77cc93b410dd7778e1b7`).

- Public registry tarball SHA-256:
  `418179af48e5092a8e42f8816e118d223d72829bbead84b172c2572efa18b44c`
- npm `dist.integrity`:
  `sha512-4cqr8B9F5Bd54enmeTizbfL7ulzXav+9XvyjDyLWeJ6XEsYuMMfuMAYhHRH1vaumfrD9yVKK4fitK7POYUkwHw==`
- Published Rust/WASM SHA-256:
  `b4f15573714f6de1eb24d04eb1fb498e2d492563ef117c8a9060a9bb44b14911`
- Archive V2 JavaScript surface SHA-256:
  `69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4`

The package passed the Core strict Methods parity gate before publication and
carries signed GitHub Actions provenance. The registry tarball was downloaded
and verified against npm's SHA-512 integrity before staging. Every staged file
is pinned by SHA-256 in `scripts/sync-core-shim.mjs`; the source commit/tree and
JavaScript/TypeScript source files are checked when that checkout is available.
