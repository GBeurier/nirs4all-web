# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`nirs4all-lite` is the **non-Python distribution / online-demos target** of the [nirs4all](https://nirs4all.org)
ecosystem. Its job is *packaging*, not new numerical code: it bundles the low-level upstream stack
(`nirs4all-formats` + `nirs4all-io` + `nirs4all-methods`/`libn4m` + `dag-ml` [+ `dag-ml-data`]) and exposes it
to non-Python runtimes. The top-level `README.md` states the broader vision (R/MATLAB/Julia/C/WASM/Conda/Docker
targets); **the only code that actually exists today is the JavaScript/WASM "online demos" target**, in two
iterations under `studio-lite/` and `single-page-WASM/`.

The cardinal rule inherited from the ecosystem (see `../CLAUDE.md`): **never reimplement NIRS, IO, or numerical
logic here.** Both subprojects are pure *consumers* of prebuilt/staged upstream WASM. A fix to a parser, an
inference rule, or a PLS routine belongs upstream (`nirs4all-formats` / `nirs4all-io` / `nirs4all-methods` /
`dag-ml`), not in a binding here. WASM artifacts are staged from the sibling repos at `../nirs4all-formats`,
`../nirs4all-methods`, `../dag-ml`, etc. — so changes here often have a cross-repo dependency.

## The two subprojects

| Directory | Stack | Role | Authoritative doc |
|---|---|---|---|
| `studio-lite/` | React 18 + Vite + TS, shadcn/Tailwind | **Active, deployed.** Full in-browser NIRS modelling loop: upload → explore/configure → build pipeline from a libn4m node catalog → run (CV via dag-ml WASM, PLS via libn4m WASM) → results/residuals → predict → export. A "mini nirs4all-studio". | **`studio-lite/CLAUDE.md`** — read it before any work in there |
| `single-page-WASM/` | Vanilla JS (one `app.js`) | **Earlier prototype.** Browser-only *dataset builder* — `nirs4all-formats` decode + `nirs4all-io` inference + `DatasetSpec` editing only. No pipeline/ML loop. Has its own `build-wasm.sh`, `make-standalone.mjs`, and Playwright `tests/`. | `single-page-WASM/README.md` |

Nearly all current work is in `studio-lite/` (every recent commit is `studio-lite:`-prefixed). `single-page-WASM/`
is the predecessor demonstrator; it is still occasionally co-updated but is not where new features land. **Do not
build a third thing or port logic between the two without being asked** — they are deliberately separate iterations.

## Build / test / run

`studio-lite/CLAUDE.md` is the single source of truth for commands, the green gate, the engine/WASM architecture,
and the gotchas. Do not duplicate or re-derive them here — open that file. In short: `npm run dev|build|build:single`,
`npm run typecheck|test|validate:catalog`, and a set of real-Chromium `tests/*.mjs` smokes that are the actual
done-criteria. `single-page-WASM/` builds independently via `./build-wasm.sh` + `node make-standalone.mjs` with its
own `tests/standalone-*-smoke.mjs`.

## Toolchain PATH trap (repo-wide, load-bearing)

Node (nvm), cargo, wasm-pack and emcc are installed but **not on the non-interactive PATH**. The plain `node`/`npm`
first on PATH are the **Windows** ones under `/mnt/c` — using them silently breaks builds. Prefix build/test commands:

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$HOME/.cargo/bin:$PATH"
# only when rebuilding WASM from source, also: source "$HOME/emsdk/emsdk_env.sh"
```

## Deployment

GitHub Pages (`https://gbeurier.github.io/nirs4all-lite/`) is built by `.github/workflows/deploy-pages.yml`, which
**only builds `studio-lite/`** (`npm ci && npm run build`, Node 22) and only on pushes to `main` that touch
`studio-lite/**`. The WASM packages are vendored in the repo, so CI does not rebuild them.
