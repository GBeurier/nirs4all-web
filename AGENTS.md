# Repository Guidelines

Follow the workspace instructions in `../AGENTS.md` when present, and the repository-specific guidance in `CLAUDE.md` (layout, toolchain PATH trap, deployment) and `web-app/AGENTS.md` before editing app code. Never reimplement parsing, dataset assembly, DAG execution or numerics here; fixes belong in the owner repositories.

## Versioning

Versions are `X.Y.Z`. `Z` (patch) = fixes and purely additive, backward-compatible features (existing outputs, wire formats, schemas and ABI symbols unchanged); `Y` (minor) = any compatibility break (changed/removed API signature, ABI break or ABI version change, wire/byte/schema/fixture change, renamed ids, changed numerical results of existing operations); `X` = product version. The package that bumps classifies its change. Cross-repository dependencies accept one tested series, `>=X.Y[.Z],<X.(Y+1)` (patch floor only when a fix or feature from that patch is required); for 1.x packages never npm `^1.x` or Cargo `"1.x"` (they accept the next minor): use `~1.4.1`, `">=1.4.1, <1.5"`, `>=1.4.1,<1.5`. Exact pins only in lockfiles, wheel locks and product install lists; intra-repo lockstep may stay exact. Web's vendored owner packages are a product install list and stay exact. See the [ecosystem version constraints](https://github.com/GBeurier/nirs4all-ecosystem/blob/main/docs/contracts/release/VERSION_CONSTRAINTS.md).

## Navigation

For indexed code, use CodeGraph first with this checkout's own `.codegraph/` (exact `projectPath`, or its CLI here). Never auto-index or substitute an ancestor or workspace-root index; the workspace index is only for intentional cross-repository tracing of declared included repositories, never Domains. Docs and configs may be read directly. Source, tests and builds are final authority.

## Language and workspace policy

All project content is English (UI text, errors, docs, comments, tests, reports, commits, PRs); converse with the maintainer in French; preserve identifiers, quotations and provenance records. Never commit credentials. Workspace `../AGENTS.md`, when present, adds shared policy on Git identity and release authority. Product frontends, shared UI, browser adapters, pins and generated assets change only in an explicit joint maintainer batch.
