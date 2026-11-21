# Third-Party Notices — nirs4all-web

`nirs4all-web` is distributed under `CeCILL-2.1 OR AGPL-3.0-or-later` (plus an optional
commercial license; see [`LICENSING.md`](LICENSING.md)). Its production JavaScript/CSS bundle
contains code from the version-locked npm dependency graph, and the application repository also
vendors qualified nirs4all Core and WASM build outputs. These components are therefore not merely
development-time downloads: they form part of the browser distribution.

It is a standalone browser client built on the npm/Node ecosystem (Vite + React + WASM); the vast majority of dependencies are **MIT**-licensed, with some **Apache-2.0** and **BSD** components. Principal dependencies:

| Component | License (SPDX) | Upstream |
|---|---|---|
| React, React DOM | MIT | https://github.com/facebook/react |
| Vite | MIT | https://github.com/vitejs/vite |
| Radix UI (`@radix-ui/*`) | MIT | https://github.com/radix-ui/primitives |
| Tailwind CSS | MIT | https://github.com/tailwindlabs/tailwindcss |
| TanStack Query | MIT | https://github.com/TanStack/query |
| three.js, `@react-three/*` | MIT | https://github.com/mrdoob/three.js |
| Recharts | MIT | https://github.com/recharts/recharts |
| `zod`, `clsx`, `lucide-react`, `framer-motion` | MIT | (respective repos) |
| ml.js (`ml`, random forest; multimodal laboratory) | MIT | https://github.com/mljs/ml |
| TensorFlow.js (`@tensorflow/tfjs` 3.21; multimodal laboratory CNN) | Apache-2.0 | https://github.com/tensorflow/tfjs |
| Burn 0.16.1 (Rust, compiled to `web-app/src/engine/wasm/lab-burn`; multimodal laboratory CNN) | MIT OR Apache-2.0 | https://github.com/tracel-ai/burn |
| TypeScript | Apache-2.0 | https://github.com/microsoft/TypeScript |

`web-app/package-lock.json` is the authoritative version-pinned npm dependency graph. A local
license report can be generated from an installed, locked dependency tree with:

```
npx license-checker --summary      # from web-app/
```

The following upstream nirs4all payloads are staged into the client distribution:

| Staged component | Repository location | Upstream |
|---|---|---|
| nirs4all Core package/WASM | `web-app/vendor/nirs4all/` | https://github.com/GBeurier/nirs4all-core |
| nirs4all-formats WASM | `web-app/src/engine/wasm/formats/` | https://github.com/GBeurier/nirs4all-formats |
| nirs4all-io WASM | `web-app/src/engine/wasm/io/` | https://github.com/GBeurier/nirs4all-io |
| dag-ml-data WASM | `web-app/src/engine/wasm/dagml-data/` | https://github.com/GBeurier/dag-ml-data |
| dag-ml WASM | `web-app/src/engine/wasm/dagml/` | https://github.com/GBeurier/dag-ml |
| nirs4all-methods WASM | `web-app/src/engine/wasm/methods/` | https://github.com/GBeurier/nirs4all-methods |

Where a `PROVENANCE.json` is present, it is a machine-readable receipt for the staged payload and
records its qualified source identity, file hashes, and build witnesses. Component license and
third-party notice files are distributed beside artifacts when provided by the qualified upstream
source. The root legal bundle is also published by the Web app under `web-app/public/legal/`.

License-family texts are bundled under [`LICENSES/`](LICENSES/): CeCILL-2.1,
AGPL-3.0-or-later, MIT, Apache-2.0, and BSD-3-Clause. The commercial-license documents in that
directory apply only to nirs4all-web itself; they do not replace or alter third-party licenses.

## Data

The multimodal laboratory bundles a derived teaching subset of the rice seed dataset of
Vu et al. (2020), *RGB and VIS/NIR Hyperspectral Imaging Data for 90 Rice Seed Varieties*,
https://doi.org/10.5281/zenodo.3241923 (paper https://doi.org/10.1109/ACCESS.2020.2969847),
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), under
`web-app/public/multimodal-data/rice-varieties/`. Changes: 10 varieties × 24 kernels, RGB kernel
crops resized to 32 × 32, three calibrated pixel spectra per kernel, a stratified train/test
partition.
It also bundles a derived subset of the mango dataset of Anderson, Walsh, Subedi and Walsh,
*Mango DMC and NIR spectra* (Mendeley Data v6), https://doi.org/10.17632/46htwnp833.6
(paper https://doi.org/10.1016/j.postharvbio.2020.111202), licensed CC BY 4.0, joined with
daily weather from the Open-Meteo Historical Weather API (ERA5 reanalysis, Copernicus Climate
Change Service; https://open-meteo.com/, CC BY 4.0), under
`web-app/public/multimodal-data/mango-dry-matter-weather/`. Changes: one spectrum per fruit
(replicate scans averaged), 405–1137 nm, seasons 1–3 train / season 4 test, up to 12/15 fruits
per harvest event; 90 days of daily maximum/minimum temperature, precipitation and shortwave
radiation up to each harvest date at one representative location per region.
And a derived subset of the wheat phenomic-selection data of Rincent et al. (2018), *Phenomic
selection is a low-cost and high-throughput method based on indirect predictions: proof of concept
on wheat and poplar*, G3 8:3961–3972 (https://doi.org/10.1534/g3.118.200760), data
https://doi.org/10.15454/MB4G3T (Recherche Data Gouv), Licence Ouverte / Etalab 2.0, under
`web-app/public/multimodal-data/wheat-phenomic-rincent2018/`. Changes: 223 varieties, grain yield
of the irrigated trial, grain and leaf NIRS of that trial every 4 nm, 2000 unimputed SNPs as 0/1/2
dosages, a declared 20 % test partition.
The synthetic teaching collections beside them are original to nirs4all-web.

The optional server workspace transport is also distributed with this application.
Its source archive identity and original license texts are available in
[server-client/NOTICE.md](server-client/NOTICE.md).
