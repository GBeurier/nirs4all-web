# NIRS4ALL reusable brand assets

The shared, canonical brand kit for the whole NIRS4ALL ecosystem. `nirs4all-ui`
is the single home; each project's real mark is vendored verbatim here so apps
and docs consume one source instead of copying their own.

Per project: `icon.svg`, `horizontal.svg`/`stacked.svg` (+ `-dark`), the icon
raster set (`icon-32/180/256/512.png`), `favicon.ico`, and the `og.png` social
card. Re-import from the flagship master with `npm run brand:generate`, verify
with `npm run brand:check`, and distribute to sibling repos with
`npm run brand:sync`. Keep the ids in sync with `src/brand/index.ts`.

Brands:
- `nirs4all` (#058E96)
- `nirs4all-core` (#E9362D)
- `nirs4all-ui` (#2563EB)
- `nirs4all-studio` (#96C800)
- `nirs4all-web` (#FF6400)
- `nirs4all-formats` (#6732B9)
- `nirs4all-io` (#CC99FF)
- `nirs4all-methods` (#00A5D2)
- `nirs4all-datasets` (#FFBE00)
- `nirs4all-providers` (#D946EF)
- `nirs4all-benchmarks` (#00704A)
- `nirs4all-repository` (#AC564A)
- `nirs4all-tools` (#475569)
- `nirs4all-papers` (#C2255C)
- `nirs4all-device` (#10B981)
- `nirs4all-cluster` (#1B5789)
- `nirs4all-quality` (#4F46E5)
- `dag-ml` (#058E96)
- `dag-ml-data` (#FFBE00)
