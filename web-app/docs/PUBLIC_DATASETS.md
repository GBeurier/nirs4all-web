# Public dataset imports (developer notes)

The upload zone offers **Browse public datasets**: the app reads a static, owner-prepared catalog
and downloads the one dataset asset the user selects. Datasets are prepared outside this
repository (the dataset recipes live in their Python host); Web publishes nothing, uploads nothing
and holds no dataset payloads in Git.

## Catalog URL

| Setting | Value |
| --- | --- |
| Default | `https://datasets.nirs4all.org/browser/catalog.json` |
| Override (build time) | `VITE_PUBLIC_DATASETS_CATALOG_URL=https://mirror.example/catalog.json npm run build` |

The endpoint is not assumed to be live. When it is missing or unreachable the dialog states that
the catalog is not available yet at that URL and offers Retry; build settings are never shown to
users. The server must allow cross-origin `GET` (CORS) for the served origin, including `file://`
(`Origin: null`) if the single-file build should use it.

## Wire contract

- Catalog: `{ schema: "nirs4all.datasets.public-browser.v1", datasets: [{ id, name, tier: "public",
  license, description?, sources: [{ id, name?, url, sha256, size_bytes }] }] }`. Only `public`
  entries are shown; relative source URLs resolve against the fetched catalog URL.
- Asset: `{ schema: "nirs4all.datasets.browser-dataset.v1", dataset_id, source_id, provenance,
  assembled }`, where `assembled` is the nirs4all-io native `assembled_full` output, one source per
  asset.

## Host responsibilities (`src/data/public-datasets.ts`)

- Credential-less, cancellable `GET` only (`credentials: 'omit'`, no referrer). This is the one
  network read allowed in app sources (see `src/app/client-side-only.test.ts`).
- Trust boundary: HTTP status, catalog/asset schema, dataset and source identity, exact byte size
  (the read stops once the declared size is exceeded) and SHA-256 (`crypto.subtle`).
- Decoding is the IO owner's `decodeAssembledFull` (`src/engine/wasm/io/assembled-wire`); the
  projection is the existing `mapAssembledToMaterialized` with explicit source and target choices.
- The complete decoded record (all partitions, targets, metadata, identity, axes, masks), the
  owner provenance and the verified digest stay on the dataset under the
  `PUBLIC_DATASET_RECORD` symbol (`publicDatasetOf(ds)`): kept by `{ ...ds }` patches, dropped by
  the structured clone sent to the engine worker. It is not an `IoRetained` (no analysis/spec)
  and is not persisted by server workspaces.

## Preparation and validation

Use the Datasets owner's `python -m nirs4all_datasets.browser_export --ids <ids> --out <outside-Git-directory>`
preparation command with native IO emitting assembled schema 3. It preserves missing values and
all rows, and refuses non-public datasets and publication-policy blockers. Review the licenses,
citations and catalog descriptions before publishing. No command in this Web feature publishes
the generated data or deploys the app.

This import requires Web's typed IO projection (`y.columns`, validity masks, declared identity
and numeric axes). The legacy matrix/first-target projection is incompatible. The owner
artifacts and typed projection are acquired together. Replicate grouping continues to use
Web's explicit repetition-column choice; public import does not change its CV policy.

`src/data/public-datasets.test.ts` includes a native-wire import through the real owner decoder,
with masked X/Y, mixed targets, signed zero and retained metadata. The browser smoke uses a
synthetic native IO fixture; it checks source and target choices, corruption, cancellation and
keyboard activation:

```sh
SMOKE_URL=http://localhost:4317/ node tests/public-datasets-smoke.mjs
```

Set `PUBLIC_DATASETS_FIXTURE_DIR` to an outside-Git export directory to additionally exercise a
real public dataset. `SMOKE_ARTIFACT_DIR` selects an outside-Git screenshot directory. The test
intercepts the catalog and asset requests locally; it makes no public uploads or origin downloads.
