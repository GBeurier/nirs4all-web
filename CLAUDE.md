# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What This Repo Is

`nirs4all-web` is the **standalone browser client** for the nirs4all ecosystem. It is a
React/Vite single-page app that runs the NIRS modelling workflow entirely in the browser through
staged WASM packages from the low-level stack:

```text
nirs4all-formats -> nirs4all-io -> dag-ml-data -> dag-ml -> nirs4all-methods/libn4m
```

This repository used to be named `nirs4all-lite`. The `lite` name is now reserved for the canonical
multi-language aggregate distribution. Do not add distribution packaging, R/MATLAB/Python bindings,
or release-factory logic here; those belong in the new `nirs4all-lite` repository.

The cardinal ecosystem rule still applies: **never reimplement NIRS parsing, dataset assembly, DAG
execution, or numerical methods here.** Fixes belong upstream in `../nirs4all-formats`,
`../nirs4all-io`, `../dag-ml-data`, `../dag-ml`, or `../nirs4all-methods`.

## Project Layout

| Directory | Role | Authoritative doc |
| --- | --- | --- |
| `studio-lite/` | Active browser/WASM app and GitHub Pages deliverable. Upload -> explore/configure -> build pipeline -> run CV/refit -> results -> predict -> export. | `studio-lite/CLAUDE.md` |

The older `single-page-WASM/` prototype has been removed from the working tree. Do not revive it
unless explicitly asked; new browser work belongs in `studio-lite/`.

## Build / Test / Run

Read `studio-lite/CLAUDE.md` before changing app code. The short command set is:

```bash
cd studio-lite
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$HOME/.cargo/bin:$PATH"
npm install
npm run typecheck
npm run test
npm run validate:catalog
npm run build
npm run build:single
```

Use the browser smoke tests for UI, engine, WASM, or persistence changes:

```bash
export CHROME=/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome
nohup npm run preview -- --port 4345 --strictPort >/tmp/n4a-web-preview.log 2>&1 & sleep 4
for t in tests/*smoke.mjs; do SMOKE_URL="http://localhost:4345/" node "$t" || break; done
pkill -f "vite preview"
```

## Toolchain PATH Trap

Node, cargo, wasm-pack, and emcc are installed but are not on the non-interactive PATH. Prefix
build/test commands:

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$HOME/.cargo/bin:$PATH"
# only when rebuilding WASM from source:
# source "$HOME/emsdk/emsdk_env.sh"
```

The plain `node`/`npm` first on PATH can be Windows binaries under `/mnt/c`; do not use them for
this app.

## Deployment

GitHub Pages is built by `.github/workflows/deploy-pages.yml`, which builds `studio-lite/`
(`npm ci && npm run build`, Node 22) and publishes `studio-lite/dist`.

After the GitHub repository rename, the Pages URL should become:

```text
https://gbeurier.github.io/nirs4all-web/
```
