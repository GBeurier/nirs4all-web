# Third-Party Notices — nirs4all-web

`nirs4all-web` is distributed under `CeCILL-2.1 OR AGPL-3.0-or-later` (plus an optional
commercial license; see [`LICENSING.md`](LICENSING.md)). nirs4all-web does **not** vendor the
components below — they are pulled from their official distributions — but their licenses are
acknowledged here as a courtesy and for compliance. Licenses are reported on a best-effort
basis; the authoritative text always ships with each upstream project.

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

For the exhaustive, version-pinned dependency tree and its licenses, run:

```
npx license-checker --summary      # from studio-lite/
```

The client consumes the nirs4all WASM/lite stack; the re-exported native libraries carry their own licenses (see each project).

License-family texts are bundled under [`LICENSES/`](LICENSES/): MIT, Apache-2.0, BSD-3-Clause.
