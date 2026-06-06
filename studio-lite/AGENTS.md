# Repository Guidelines

## Project Structure & Module Organization

`nirs4all-studio-lite` is a Vite, React, and TypeScript single-page WASM demo. The app shell lives in `src/app/`; feature UI is grouped under `src/components/dataset`, `src/components/pipeline`, and `src/components/results`. Shared UI primitives are in `src/app/components/ui`. Domain code is split into `src/catalog` for operator definitions and presets, `src/data` for CSV/WASM ingestion and bundled samples, `src/engine` for the `Engine` contract, orchestration, workers, and staged WASM backends, and `src/lib` for small utilities. Styles are in `src/styles`. Unit tests live beside source as `src/**/*.test.ts`; browser smoke tests live in `tests/*.mjs`. Generated outputs are `dist/` and `dist-single/`; do not edit them directly.

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

Recent history uses concise conventional-style commits such as `fix(studio-lite): ...`, `feat(studio-lite): ...`, and `perf(studio-lite): ...`. Keep commits scoped and imperative. PRs should include a short summary, linked issue or context, validation commands run, and screenshots or recordings for visible UI changes. Call out catalog, WASM, engine contract, or smoke-test-impacting changes explicitly.

## Agent-Specific Instructions

See `CLAUDE.md` for deeper architecture notes, workstation PATH details, and the full green-gate workflow. Preserve the no-backend model: data should remain local in the browser unless a change is explicitly approved.
