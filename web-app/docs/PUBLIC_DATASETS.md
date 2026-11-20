# Public dataset imports (developer notes)

**Browse public datasets** reads public metadata embedded in the Datasets WASM owner. After
the user selects a supported spectral source, Web downloads its declared files directly from
the original publisher. Datasets prepares the inputs and IO assembles them in browser memory.
This path needs no hosted dataset mirror, Python service, catalog endpoint or upload.

## Owner contract

The staged Datasets module must expose all three APIs below. A build with an older module
reports the missing capability explicitly; it does not infer a recipe or try another route.

- `browserCatalog()` returns JSON with schema
  `nirs4all.datasets.public-origin-catalog.v1`, public dataset descriptions, supported or
  unsupported spectral sources, resource kits, licenses and owner provenance. Unsupported
  sources stay visible with the owner's reason; they cannot be imported.
- `resolveBrowserPlan(datasetId, sourceId)` returns JSON with schema
  `nirs4all.datasets.public-origin-plan.v1`, the selected identities, the exact ordered
  resource kit, the owner descriptor and provenance. Web forwards this complete JSON string
  unchanged to preparation, including owner extensions it does not interpret.
- `prepareBrowserDataset(planJson, files)` returns `{ files, record_sets, spec, provenance }`.
  Web passes these inputs directly to
  `io.assembleDataset(files, record_sets, JSON.stringify(spec))`. Dataset-specific parsing,
  roles, target mappings, axes, identities and missing-value policy belong to Datasets and IO.

Resource entries contain `{ id, name, url, sha256, size_bytes }`. Hash and size pins may be
`null` when the original source declares none. Web never substitutes an observed digest for
a publisher pin. Recipe support is profile-specific; an entry in the catalog does not imply
that every source is supported by the browser.

## Host responsibilities (`src/data/public-datasets.ts`)

- Browse embedded metadata without downloading an index or dataset. Multiple spectral sources
  require an explicit source choice; only that source's declared resource kit is downloaded.
- Use cancellable `GET` requests with `credentials: 'omit'` and no referrer. This is the one
  network read allowed in app sources (`src/app/client-side-only.test.ts`). Original publishers
  must permit cross-origin requests from the served application. The offline HTML build also
  needs the publisher to permit its `Origin: null`; offline packaging cannot grant CORS access.
- Check HTTP status, owner schema, dataset/source identity and resource-kit agreement. Enforce
  real size and SHA-256 pins when present. Retain observed size, SHA-256 and final response URL
  separately, and keep unknown download size unknown. Network, integrity, owner-preparation
  and unsupported-profile failures do not adopt a partial dataset.
- Project the complete IO record through `mapAssembledToMaterialized`, preserving all targets,
  masks, metadata, identity, units and axes. Existing unsupported projection cases remain
  explicit refusals. A displayed target choice does not remove other targets from a run.

The complete owner record, original inputs, prepared inputs and specification, raw plan,
catalog/recipe provenance and resource receipts stay under `PUBLIC_DATASET_RECORD`
(`publicDatasetOf(ds)`). Object-spread patches retain it; the structured clone sent to the
engine worker drops it. This is a `PublicDatasetRetained`, not an inferred `IoRetained`, and
server workspaces do not persist it. Public imports do not add a new missing-value replacement
or CV/grouping policy; existing explicit launch choices and refusals still apply.

## Verification and delivery

`src/data/public-datasets.test.ts` checks the owner boundary, explicit source/target choices,
cancellation, resource-kit fidelity, real-pin refusal and observed-only integrity. Its native
IO fixture preserves missing X/Y, mixed targets, signed zero and metadata without introducing
a Web parser.

The browser smoke uses the actual staged Datasets and IO modules and intercepts one declared
original-source request with a small, faithful synthetic CSV. It exercises browsing, keyboard
activation, cancellation, HTTP refusal, retry and successful owner assembly:

```sh
SMOKE_URL=http://localhost:4317/ node tests/public-datasets-smoke.mjs
```

`SMOKE_ARTIFACT_DIR` selects an outside-Git screenshot directory. Interception is deterministic
UI evidence, not proof that the publisher currently allows CORS or that a real dataset was
downloaded. Qualify live original-source access separately, retaining its actual URL, observed
integrity, owner versions and result. Never claim all catalog profiles from one successful
source. Candidate owner bytes may be tested through an isolated configuration; public staging,
pins and served claims require the owner's actual qualified publication.
