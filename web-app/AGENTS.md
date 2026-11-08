# Repository Guidelines

## Project Structure & Module Organization

`nirs4all-web` is a Vite, React, and TypeScript single-page WASM app. The app shell lives in `src/app/`; feature UI is grouped under `src/components/dataset`, `src/components/pipeline`, and `src/components/results`. Shared UI primitives are in `src/app/components/ui`. Domain code is split into `src/catalog` for operator definitions and presets, `src/data` for CSV/WASM ingestion and bundled samples, `src/engine` for the `Engine` contract, orchestration, workers, and staged WASM backends, and `src/lib` for small utilities. Styles are in `src/styles`. Unit tests live beside source as `src/**/*.test.ts`; browser smoke tests live in `tests/*.mjs`. Generated outputs are `dist/` and `dist-single/`; do not edit them directly.

## Build, Test, and Development Commands

Use `npm install` to install dependencies. On this workstation, ensure Node is from nvm if needed:

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$HOME/.cargo/bin:$PATH"
```

Key commands:

- `npm run dev`: start the Vite dev server.
- `npm run build`: build the served static app into `dist/`.
- `npm run build:single`: build offline single-file output into `dist-single/index.html`.
- `npm run typecheck`: run `tsc --noEmit`; Vite builds do not typecheck.
- `npm run test`: run Vitest unit tests in Node.
- `npm run validate:catalog`: verify catalog ABI symbols against staged libn4m exports.
- `npm run wasm`: rebuild and stage WASM artifacts.

For browser verification, run a preview server and set `SMOKE_URL`, for example `SMOKE_URL=http://localhost:4173/ node tests/smoke.mjs`.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, React function components, and the `@/*` alias for `src/*` imports. Match existing formatting: 2-space indentation, single quotes, and no semicolons. Use PascalCase for React components and types, camelCase for functions and variables, and `use*` names for hooks. Keep shared data contracts in `src/engine/types.ts` and `src/components/contracts.ts` authoritative.

## Testing Guidelines

Write focused Vitest tests next to the code they cover with the `.test.ts` suffix. Use `describe`/`it` blocks and deterministic fixtures where possible. Use `tests/*smoke.mjs` for browser workflows that need the full app, WASM loading, persistence, or UI interaction. Before a PR, run at least `npm run typecheck`, `npm run test`, and `npm run validate:catalog`; run builds and relevant smoke tests for UI, engine, or WASM changes.

## Commit & Pull Request Guidelines

Recent history uses concise conventional-style commits such as `fix(web-app): ...`, `feat(web-app): ...`, and `perf(web-app): ...`. Keep commits scoped and imperative. PRs should include a short summary, linked issue or context, validation commands run, and screenshots or recordings for visible UI changes. Call out catalog, WASM, engine contract, or smoke-test-impacting changes explicitly.

## Agent-Specific Instructions

`nirs4all-web` is a full-WASM browser client with **no Python and no backend**. It consumes formats, io, dag-ml-data, dag-ml and methods as prebuilt/staged WASM and **never reimplements NIRS, IO, dataset assembly, DAG execution or numerical logic**; fixes belong in the owner repositories. Data stays local in the browser unless a change is explicitly approved. Use shadcn primitives and the brand theme already in the repo; fonts are local/system stacks only (`src/styles/fonts.css`), never remote font imports.

Scientific and privacy rules that must survive any edit (details in `docs/AGENT_OPERATIONS.md`):

- Preprocessing fits on the train fold only; out-of-fold predictions are joined by `sampleId`, never row order; the test partition is held out of CV; the engine refuses to train without targets.
- Never set `allowTrainingRows` implicitly: the `.n4a` export asks for explicit consent whenever a model contains training rows.
- Predict refuses named columns that differ in names, order or count; header-less input is stated as positional.
- Classification class vocabularies are sorted consistently in `dataset.ts`/`samples.ts` and `orchestrate.ts`; `n_components` stays clamped to `min(n_components, n, p)`.
- dag-ml controllers echo `task.seed` as exact digits; never round-trip a u64 seed through a JS `Number`.
- Engine compute stays in the Web Worker in the served build; do not move it to the main thread.
- Smoke tests depend on exact UI strings (`Run pipeline`, `CV Scores`, the samples×wavelengths badge, demo-sample names, `compiled by dag-ml`); update `tests/*.mjs` with any rename.

Toolchain trap: Node, cargo, wasm-pack and emcc are not on the non-interactive PATH, and the plain `node`/`npm` first on PATH may be Windows binaries under `/mnt/c`; use `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$HOME/.cargo/bin:$PATH"`. The green gate is typecheck + test + validate:catalog + build + build:single + every `tests/*smoke.mjs` with no console errors (`vite build` does not typecheck). Full commands, smoke inventory, architecture and gotchas: `docs/AGENT_OPERATIONS.md`. Repository `../AGENTS.md` and workspace `../../AGENTS.md`, when present, add shared policy.

## Language Policy

All application and project content must be in English, including UI text, subtitles, tooltips, errors, documentation, comments and docstrings, test and fixture prose, reports, pull requests, commits, and generated content. Conversation with the maintainer may be in French. Preserve proper names, identifiers, filenames, source quotations, and historical or provenance records where translation would change their meaning or provenance.
