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
