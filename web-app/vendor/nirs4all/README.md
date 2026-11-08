# JavaScript/WASM Binding

npm package name: `nirs4all`

The canonical source repository is `nirs4all-core`; the npm publication uses
the bare `nirs4all` name as the JavaScript/WASM aggregate surface. Python alone
uses the `nirs4all-core` distribution name to avoid colliding with the full
modelling library.

This package is the runtime surface that `nirs4all-web` should consume. The web
application lives in `nirs4all-web`; this directory is for the reusable
JavaScript/WASM binding and package metadata.

## Canonical V1 `.n4a` exchange

The new library actions are `produceN4aNative`, `inspectN4aBytes`,
`predictN4aNative` and `retrainN4aNative`. Their source is being integrated with
the shared Core portable owner API; compiled exchange qualification is pending.
Use a matching local Core/DAG-ML/IO/Methods cohort until the coordinated V1
package release. This section does not claim support from older published packages.

The actions accept exact IO record and archive bytes. Core/IO derive identities
and prepare requests, DAG-ML schedules training, scoring, selection and replay,
and Methods owns fitted state and numerical operations. JavaScript marshals
arrays and selects callback rows by sample ID. It does not compile recipes or
replace missing state by fitting.

```javascript
import { produceN4aNative, predictN4aNative, retrainN4aNative } from 'nirs4all';

const trained = await produceN4aNative(trainingRecordBytes, {
  sourceId: 'spectra',
  recipe: {
    steps: [
      { method_id: 'preprocessing.scaling.standard_scale', role: 'transformer', params: {} },
      { method_id: 'models.regularized.ridge', role: 'regressor', params: { scale_x: false } },
    ],
    candidates: [{ alpha: 0.1 }, { alpha: 1.0 }],
  },
});
const prediction = await predictN4aNative(trained.archiveBytes, {
  entrypoint: 'predict-external',
  sourceId: 'spectra',
  record: predictionRecordBytes,
});
const retrained = await retrainN4aNative(trained.archiveBytes, newTrainingRecordBytes);
```

Production fits once and returns sealed `archiveBytes`. Retraining reads the
recipe from the validated archive; the caller supplies no replacement recipe.
Prediction exposes physical record-order `sampleIds` while preserving the signed
DAG replay unchanged. Align replay values by sample ID and target name. Inspection
returns the closed native-model view; readability alone does not grant execution.
Parsed JavaScript diagnostic views use JSON numbers; retain archive bytes and
exact owner JSON for identities or integers beyond JavaScript's exact range.

The first exchange gate targets single-source standard_scale/Ridge regression
with two complete targets, native Linux and Node WASM, including both prediction
directions and stored-recipe retraining. Other methods, browsers, classifiers,
partial targets and WASM calibration are not qualified by that gate. The dedicated
`n4a_wasm_exchange` Rust target drives `tests/n4a-exchange-driver.mjs`; missing
qualification inputs fail explicitly. Binding unit tests alone establish no
numerical portability.

### Generic `.n4a` storage (host payloads)

`openN4aContainer`, `writeN4aContainer` and `writeN4aStream` read and write any V1
`.n4a` container, including host-owned payloads Core cannot interpret. They are
storage only: only the Core WASM bridge is loaded, never Methods or DAG-ML, and no
owner payload is deserialized, trusted or executed. Readability is not executability;
`predictN4aNative` still refuses anything outside the supported native profile.

```javascript
import { openN4aContainer, writeN4aContainer, writeN4aStream } from 'nirs4all';

// Exact bytes held in WASM memory.
const { archiveBytes, receipt } = await writeN4aContainer(manifestJson, [
  { path: 'payloads/model.bin', bytes: hostModelBytes },
]);
const container = await openN4aContainer(archiveBytes);
try {
  container.view();                            // verified storage, `executability: 'not_evaluated'`
  container.manifestBytes();                   // exact stored manifest.json
  container.member('payloads/model.bin');      // exact bytes, or undefined
  container.artifactMembers('artifact:model'); // [{ path, bytes }, ...]
} finally {
  container.close();                           // frees the WASM allocation
}

// An archive that stays outside WASM memory: a File/Blob or { size, read(offset, length) }.
const external = await openN4aContainer(file, { memoryBudgetBytes: 64n * 1024n * 1024n });
try {
  for await (const chunk of external.memberStream('payloads/model.bin')) consume(chunk);
  // The last chunk arrives only after Core matched every byte read against the receipt.
  const whole = await external.readMember('payloads/small.json'); // allocates the whole member
} finally {
  external.close();
}

// Write without assembling the archive; sources are read twice (hash, then payload).
await writeN4aStream(manifestJson, [{ path: 'payloads/model.bin', source: file }], sink, { base: external });
```

**Sources.** Exact bytes are copied into WASM memory once and keep Core's full owner
semantic view. A `Blob`/`File`, or an object `{ size, read(offset, length) }` whose
arguments are BigInt and whose `read` resolves to exactly that range, stays outside
WASM: Core's scanner requests ranges, the host reads and feeds them, and only
validated metadata is retained. `view()` of such a container reports `semantics` and
`training_view` as `not_evaluated`, because no member bytes were read. The same
scanner serves every host; JavaScript parses no ZIP, computes no CRC and no hash.

**Verified streams.** `memberStream(path)` and `archiveStream()` re-read the source,
Core hashes the bytes actually returned and compares them with the validated receipt,
and the final chunk is delivered only after that comparison succeeds. Earlier chunks
are therefore unverified until the iteration finishes without throwing; a changed
source refuses with an integrity error. A bytes-held container streams from its
immutable WASM copy. `readMember` and `readArchive` materialize and verify the whole
range; `member`, `artifactMembers` and `archiveBytes` are synchronous and need a
bytes-held container.

**Budget.** `memoryBudgetBytes` (a safe integer, a BigInt or exact decimal text, never
rounded) is an optional declaration of authorized working memory for one operation.
Core admits an allocation against it before any wasm-bindgen copy and refuses with a
memory error. Without it Core declares no ceiling and imposes no limit on content size,
member count, manifest size or path length: only the allocator and the real host limits
below remain. The budget charges working allocations, never payload bytes that stay in
the source; the streaming chunk is derived by Core from the budget (a buffer size, not
a limit), so a budget below one chunk refuses. It does not detect or promise machine
memory. Every native action (`produceN4aNative`, `retrainN4aNative`,
`predictN4aNative`, `inspectN4aBytes`) accepts the same option.

**Writing.** Core derives each member's size, SHA-256 and CRC-32 and re-serializes the
manifest canonically, so whitespace and key order of the input are not kept; use the
original archive for an exact copy. `members` is an array so duplicate paths are
refused instead of collapsed. With `{ base }`, each member the manifest declares and
`members` omits comes from the base (digests from its validated inventory, bytes copied
verified); omitting a member from the manifest removes it. The base is never modified.
Owner identities stored inside replaced payloads are not recomputed.
`writeN4aContainer` assembles the archive in memory (it needs a bytes-held base).
`writeN4aStream` appends chunks to `sink = { write(chunk), close?(), abort?(error) }`
and resolves to `{ receipt }`. A source whose bytes changed between the two passes is
refused. On any failure after writing started, `abort(error)` is called and the sink
must be discarded: it may already hold bytes that were not verified. `close()` runs only
after Core confirmed the container SHA-256 of the bytes written.

**Real host limits** (reported as `n4a host limit` or as the engine's own error, never
as format limits): JavaScript safe integers (2^53 - 1) for `Blob` offsets and array
sizes, the engine's typed-array length when a whole member or archive is materialized,
and wasm32 linear memory, where an allocation that fails inside WASM traps instead of
returning a refusal. Archive paths are names inside the container, never
operating-system paths.

**Not qualified.** This source has not been compiled or run against a built bridge.
Not claimed: execution or scientific equivalence of host payloads, browser behaviour,
or behaviour at multi-gigabyte sizes. Native actions (`produce`, `retrain`, `predict`)
remain byte-based and bounded by WASM linear memory.

## Existing routes awaiting consumer migration

The following routes remain while active consumers migrate in their authorized
batches. They do not establish canonical V1 exchange.

The portable execution API delegates Kennard-Stone, SNV, MSC, Savitzky-Golay, and
PLS component sweeps to `@nirs4all/methods`:

It also accepts `n4m.Ridge`, `n4m.RidgePLS`, `n4m.RobustPLS`, `n4m.CPPLS`,
`n4m.SparseSIMPLS`, `n4m.ECR`, `n4m.ContinuumRegression`, and `n4m.MIRPLS`
as final model steps. These use Methods `fitModel` and `predictModel`; the
serialized selected model can be replayed after JSON roundtrip. Recipe
parameters map to Methods in positional order: `lambda`, `ridge_lambda`,
`[huber_k, max_irls_iter]`, `gamma`, `sparsity_lambda`, `alpha`, `tau`, or no
extra parameters, respectively. `n_components` is passed separately and may
be swept with `_range_`. Unknown model parameters are rejected.

The same `fitModel`/`predictModel` path also supports `n4m.FusedSparsePLS`,
`n4m.BaggingPLS`, `n4m.BoostingPLS`, and `n4m.RandomSubspacePLS`. Their
positional parameters are `[l1_lambda, fusion_lambda]` (defaults 0.05/0.05),
`[n_estimators, seed]` (50/0), `[n_estimators, learning_rate]` (50/0.1), and
`[n_estimators, features_per_subspace, seed]` (50/10/0). Subspace width is
checked against the fitted feature count. These recipes have native C and mock
contract checks, not numerical WASM parity without a fresh WASM artifact.

`n4m.NPLS` accepts flattened tensor features with required positive integer
`mode_j` and `mode_k`; their product must equal the fitted feature count.
`n_components` defaults to 2. Methods fits the native N-PLS kernel and the
serialized coefficient/mean state replays on later matrices. The Core recipe
currently accepts a single target; a native C oracle additionally checks
two-target held-out prediction. Real WASM parity requires a fresh artifact.

`n4m.GroupSparsePLS` requires an explicit `group_assignment` array with one
non-negative 32-bit group ID per fitted feature. `group_lambda` defaults to
0.05 and must be finite and non-negative. The recipe preserves the group IDs
in JSON/YAML and fitted model metadata; fit and replay use the corrected native
Methods post-SIMPLS group-wise coefficient shrinkage (not a refit of sparse
latent directions). The WASM parity gate checks held-out predictions
at both zero and positive penalty against Python n4m. This is a bounded recipe
and coefficient replay, not a claim that an R/Python trained archive can already
be imported into the browser.

- `runPortablePipeline(source, dataset)` parses the shared nirs4all JSON/YAML
  syntax, executes the portable subset, and returns parity-checkable split,
  target, variant, and selected-result fields plus a serialized selected PLS
  model.
- `predictPortablePipeline(result, dataset)` replays the recorded preprocessing
  chain and predicts with that serialized model through the same methods WASM
  backend. Fitted preprocessing state is serialized as numeric arrays in each
  step and restored before prediction. Older results with stateless steps remain
  readable; a persisted MSC step without fitted state is rejected because its
  training reference cannot be recovered from prediction data.

MSC recipes accept `n4m.MSC` and the nirs4all Python `MSC` /
`MultiplicativeScatterCorrection` class aliases. They call the Methods `MSC`
operator with no numeric parameters. The Python `scale` and `copy` flags are
accepted as booleans; they do not alter the Methods numerical operation.

SPA recipes accept `n4m.SPA` (also `n4m.SPASelector` and
`pls4all.sklearn.SPASelector`) before the final model. `top_k` is required;
`n_components` defaults to 2. Methods fits the selector on training rows only.
The result stores validated zero-based selected indices in the native ranked
order. Fit and prediction project a sorted copy onto ascending columns without
re-fitting SPA. A missing, duplicate, or out-of-range index is rejected.

The generic `n4m.Selector` step accepts all 25 Methods selector names with
`{method, n_components, method_params}`. It calls the native selector once on
training rows, stores zero-based indices in their native ranked order, and
projects a sorted copy onto validation and replay matrices. Methods requiring
internal validation receive deterministic folds over training rows only. Seeds,
threshold vectors, and other method parameters are passed through the native
C ABI; this surface has mock-contract coverage but not numerical WASM parity
until a current Methods WASM artifact is built and tested.
- `replayMethodsArchiveV2(archiveBytes, dataset)` validates the bounded Archive
  V2 stored-ZIP, manifest, inventory digests, DAG-ML package, execution bundle,
  and N4MM binding in Rust, then imports and predicts the single multi-target
  model through the public `@nirs4all/methods` C ABI. The native file reader and
  WASM byte reader compile the same Core-owned `archive_v2.rs` validation source;
  there is no second binding-owned archive parser. The JavaScript layer only
  validates host arrays and handles marshalling/ownership; it contains no
  numerical fallback and never fits a replacement model. Before import it also
  compares the manifest's capability-derived `abi_min_minor` with the actual
  Methods WASM `abiVersion()` and refuses an older runtime.

`runPortablePipeline` also accepts one training-only native X augmentation
before preprocessing and the model. It runs after splitting and applies only
to the training matrix; `predictPortablePipeline` never replays it. The kind is
one of the 22 snake_case names in the closed Methods ABI 2.11 X→X subset, and
`values` follows that kind's native positional parameter order. For example:

```json
{"pipeline":[
  {"train_augmentation":{"class":"n4m.NativeXAugmentation","params":{"kind":"gaussian_noise","values":[0.03],"seed":42}}},
  {"model":{"class":"sklearn.cross_decomposition.PLSRegression","params":{"n_components":2}}}
]}
```

This Level 1 WASM runner requires a Methods package exposing `augmentNative`.
It records the declaration with the fitted result for provenance. The
augmentation has no fitted state or prediction transform and is outside Core's
Archive V2 and DAG training contracts.

The Archive V2 WASM replay intentionally covers the Phase 2 portable Methods
PLS final-refit contract only. N4MM v2 preprocessing stays embedded in Methods
and therefore receives the raw matrix without a JavaScript kernel. Archives with multiple predictor
nodes, optimization checkpoints, conformal/robustness payloads, external or
host-only artifacts, undeclared inventory members, incompatible N4MM metadata,
or non-Methods dispatch are refused rather than silently approximated.

Build the Rust validator with `npm run build:native`. A qualification archive
and closed scenario can be replayed with:

```sh
npm run qualify:archive-v2 -- /path/to/archive.n4a /path/to/scenario.json
```

### Complete portable predictor transport

`writeNativePredictorPackage(containerId, outcomeBytes, packageBytes)` and
`writeNativeRefitPackage(containerId, packageBytes)` build a new owner-neutral
Core V1 container holding the native Package V2 / Package V3 scientific closure
from the exact DAG-ML JSON bytes; Core builds the closure through DAG-ML.
`readPortableArchiveV2(archiveBytes, { entrypoint, memoryBudgetBytes })` returns
`{ archiveId, archiveSha256, manifest, members, package, trainingOutcome, view }`
after Core validated the container and the selected closure: `package` is the
exact root package `Uint8Array`, `members` only the selected verified physical
members, `manifest` the neutral Core V1 manifest (there is no physical replay
map) and `trainingOutcome` is `null` for a standalone Package V3. There is no
intrinsic byte cap; only the optional host-authorized `memoryBudgetBytes`
bounds a call. Package V3 is readable and storable; WASM execution of Package V3
remains explicitly unsupported. All entrypoints reuse the same Core Rust source
as the file/Python surfaces; JavaScript implements no ZIP format or numerical
code. The old physical payload writer is removed; existing Package2/3 semantic
reader/replay names remain. Core retains RAW Methods state bytes, signed package
bindings and explicit runtime controller trust; it does not reinterpret one
state family as another. `replayMethodsArchiveV2` remains the separate closed
N4MM execution surface.

This transport supports a complete captured ensemble, including its learned
meta-model. It does not claim the canonical U07 N-D encoders or the same-DAG
R/Octave training profile.

The qualification command asserts the ordered two-dimensional result from one
model import and one multi-target prediction, checks that no Methods fit symbol
was called, and proves tampered-digest and inventory refusals. The isolated
tarball gate separately proves refusal when the optional Methods peer is absent.

Savitzky-Golay defaults to `mode: "interp"` for full nirs4all parity and
preserves explicit methods-backed modes (`mirror`, `constant`, `nearest`,
`wrap`, `interp`) plus `cval` in the serialized preprocessing chain.

## Generic n4m role recipes and trained envelopes (v8)

Any Methods estimator is a recipe step through the language-neutral token
`"n4m:<catalog method id>"` (or `{ class: "n4m:<id>", params }`), shared with
the full Python `nirs4all`, the R package and the Rust binding.
`loadPipelineDefinition(source, { methods })` accepts these tokens when they
resolve in the loaded Methods manifest (`methodClass`), next to the legacy
class names above; `n4mRoleCapabilities()` lists the usable steps from the
same manifest instead of a hand-maintained list.

`N4mRolePipeline` fits such a recipe (sample filters on training rows only,
transformers and selectors, then one regressor or classifier) in the native
Methods `RolePipeline`, which validates the recipe, passes every target column
to the steps that need `y`, checks the column names and refuses states that
contradict the recipe. It reads/writes the `nirs4all.n4m.trained_pipeline.v8`
envelope (`{schema, recipe, n_features, feature_names?, states: [{method_id,
n4me_base64, sha256, contains_training_rows, class_names?}]}`); envelopes
without `feature_names` / `contains_training_rows` still load. A pipeline
trained in Python or R replays in the browser from its N4ME states (level L2):

```js
import { N4mRolePipeline } from 'nirs4all';

const fitted = await N4mRolePipeline.fromJSON(envelopeText);
const { data } = fitted.predict({ X, rows, cols, featureNames }); // regressor
const { labels } = classifier.predict({ X, rows, cols });          // classifier
const trained = await N4mRolePipeline.fit(recipe, { X, rows, cols, y, featureNames });
const text = JSON.stringify(trained.toJSON({ allowTrainingRows: false }));
```

With `featureNames`, renamed or reordered columns are refused. Nested `X` and
`y` rows must match the declared `rows`/`cols` (every row is checked before
flattening). The import refuses an `n_features` that is not a positive
integer equal to the native width, a column name holding NUL, and a
`class_names` table that is not a non-empty list of unique strings or finite
numbers labelling every fitted class id (index = id). `recipe` is a copy of
the recipe the states attest, which is also the one exported. A state that
embeds training rows (kernel PLS, LW-PLS, ...) is exported only with
`toJSON({ allowTrainingRows: true })`. This path requires `@nirs4all/methods`
1.2 (ABI 2.14 role pipelines).

Custom app hosts can inspect `executionProfiles()` (also embedded in
`capabilityManifest()` with `runtimeSurfaces`) before selecting a runtime. The
registry (`nirs4all-core.execution-profiles.v1`) declares exactly two supported
profiles, `native-workflow@1` and `native-conformal@1`, with per-operation
`supported`/`unsupported` entries (compile, fit, predict, import, export) and
the content types they carry (`nirs4all.native-pipeline.v1`;
`nirs4all.calibrated.v1`, a Core wrapper schema that JS/WASM itself never emits:
its calibrated import/export move the native archive V2 bytes). It is a metadata contract, not numerical certification. See
`docs/EXECUTION_PROFILES.md`.

## JavaScript model controllers

`createJsEstimatorController()` adapts a synchronous JavaScript estimator with
`fit(X, y)` (or `train(X, y)`) and `predict(X)` to DAG-ML's native
`HostControllerSpec`/`ControllerManifest` and `NodeTask`/`NodeResult` contracts.
Pass the initialized `dag-ml-wasm` module, a native DAG-ML `FoldSet`, and a
sample-ID-aligned numeric dataset. DAG-ML assigns folds, variants, phases and
64-bit seeds; the controller selects only each fold's training rows and emits
identity-keyed validation predictions. `REFIT` keeps the fitted JS object for
`PREDICT`. The public `createDagMlNodeResult()` helper lets browser clients
return the same wire result from an n4m-backed controller without duplicating
lineage or prediction serialization.

```js
import * as dagMl from 'dag-ml-wasm';
import { createRandomForestController } from 'nirs4all';

const controller = await createRandomForestController({
  dagMl, // initialize the WASM module before this call
  foldSet, // returned by dagMl.kfold_split_json / stratified_kfold_split_json
  dataset: { sampleIds, X, y },
});
const manifestsJson = JSON.stringify([controller.manifest]);
const resultsJson = dagMl.execute_execution_plan_phase_json(
  planJson, manifestsJson, 'run:example', 42, 'FIT_CV', controller.invoke,
);
```

Install the optional `ml-random-forest` peer to use that adapter. It supports
regression and numeric-class classification; `n_estimators` in pipeline params
maps to the library's `nEstimators` option. `fitFull()`/`predict()` and
`exportModel()`/`importModel()` serve simple host workflows. Other synchronous
classic-ML libraries can use `createJsEstimatorController()` directly. The JS
estimator's predictions are contract-compatible with DAG-ML, but numerical
parity with Python is only claimed for the n4m-backed portable methods path.
No browser Python or deep-learning training runtime is required.

`createN4mModelController()` uses the same fold/phase contract for any
coefficient-based `@nirs4all/methods` model supported by `fitModel()` and
`predictModel()`. Supply `modelType` (for example, `"PLSRegression"` or
`"Ridge"`) and an initialized Methods binding. DAG-ML params may contain
`n_components` and the Methods positional `params` vector. The adapter has
no numerical implementation; its fold predictions are tested against direct
Methods WASM calls at a `1e-12` absolute threshold.

### Classical JavaScript ML and sklearn-style interfaces

Import these optional adapters from `nirs4all/classic-ml`; the default entry
does not load their ML dependencies.
Call `loadMlJs()` or `loadScikitJs()` during setup, then pass the loaded module
to the synchronous controller factory. Fit, predict and DAG-ML callbacks stay
synchronous for the supported controllers.

`loadMlJs()` loads the optional [`ml`](https://github.com/mljs/ml) collection
on demand. `createMlJsEstimator()` wraps its random forests, decision trees and
k-nearest-neighbor classifier with `getParams()`, `setParams()`, `fit()` and
`predict()`. `createMlJsPca()` adds `fit()`, `transform()`, `fitTransform()` and
`inverseTransform()` around ml.js PCA. `createMlJsController()` connects the
supported supervised models to the native DAG-ML fold and phase contract. The
collection also exposes its matrix, decomposition and statistics tools directly
through `loadMlJs()`; this is a selected numerical toolbox, not the entire SciPy
API. Model JSON belongs to ml.js and is not a sklearn pickle or a portable n4m
artifact.

`loadScikitJs()` loads optional `scikitjs` and a compatible TensorFlow.js 3.x
backend only when requested. `createScikitJsEstimator()` exposes the same
structural estimator/transformer interface for its classes, preserving whether
their `fit()` returns immediately or returns a Promise. Its output tensors are
converted to ordinary arrays and disposed at the boundary. Sync decision-tree
classifiers and regressors can also use `createScikitJsController()` with the
native DAG-ML WASM scheduler. Other scikitjs estimators, including its linear
models, train asynchronously and cannot run inside the current synchronous
DAG-ML WASM callback. Their host API remains available; forcing a Promise into
the synchronous callback would break fold/seed validation. Scikitjs models use
`exportModelAsync()` and `importModelAsync()` on the DAG controller because its
serializer is asynchronous.

`createScikitJsAsyncController()` is the awaiting host counterpart. It offers
`invokeAsync()`, `fitFull()`, `predict()`, `exportModel()` and `importModel()` as
Promises for scikitjs classes such as `LinearRegression`. A host can pass it
native DAG-ML `NodeTask` records and await each result. It cannot be passed to
the current synchronous `dag-ml-wasm` phase callback: blocking that browser
worker would prevent the Promise from resolving. Native scheduler execution of
these estimators needs a DAG-ML async phase driver.

| Classical ML capability | This JS package | Web pipeline catalogue |
| --- | --- | --- |
| ml.js random forests, CART trees, KNN classifier | Synchronous DAG-ML controllers | Five model nodes |
| ml.js PCA | Host fit/transform/inverseTransform | No pipeline node |
| scikitjs trees | Synchronous DAG-ML controllers | No node |
| scikitjs async classes, e.g. LinearRegression | Awaiting host controller | No DAG-ML/Web node yet |
| Kanaries ML | Evaluated, no binding | No node |
| Torch, ONNX and neural-network training | No binding | No node |

`docs/CLASSIC_ML_JS.md` in the Core repository records qualification evidence,
the portable n4m scope, and remaining gaps. ML library JSON artifacts are
library-specific; only the n4m portable subset has a cross-language binary
and Python-oracle parity claim.

Both libraries are optional peer dependencies. They provide familiar classical
ML APIs in JavaScript, but no numerical equality with sklearn is claimed for
their independently implemented algorithms. The Methods-backed portable subset
retains its separate Python oracle gate.

For a browser-only custom host, pair this package with `nirs4all-ui`: keep
runtime loading and portable execution in `nirs4all`, and consume shared React
components / view-model helpers / brand assets from `nirs4all-ui`. The
reference composition lives in the `nirs4all-web` browser app, whose contract
tests exercise `runPortablePipeline()` / `predictPortablePipeline()` together
with the shared UI package in a no-backend environment.
