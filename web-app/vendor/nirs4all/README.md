# JavaScript/WASM Binding

npm package name: `nirs4all`

The canonical source repository is `nirs4all-core`; the npm publication uses
the bare `nirs4all` name as the JavaScript/WASM aggregate surface. Python alone
uses the `nirs4all-core` distribution name to avoid colliding with the full
modelling library.

This package is the runtime surface that `nirs4all-web` should consume. The web
application lives in `nirs4all-web`; this directory is for the reusable
JavaScript/WASM binding and package metadata.

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

`writePortableArchiveV2(manifest, members)` writes DAG-ML-assembled opaque
payloads through the canonical Core stored-ZIP writer. `members` is a mapping
of relative paths to typed byte arrays. `readPortableArchiveV2(archiveBytes)`
returns `{ archiveId, archiveSha256, manifest, members }` after native inventory,
hash and byte-budget validation. Both reuse the same Core Rust source as the
file/Python surfaces; JavaScript implements no ZIP format or numerical code.

The additive optional `payloads.methods.role_pipelines` family transports
complete RAW `methods_role_pipeline` wrappers at SHA-addressed
`artifacts/<sha256>.json` paths. It retains the original signed DAG-ML package
and controller trust contract; it does not relabel N4ME states as N4MM.
These functions validate storage only. Before hydration, use DAG-ML's native
portable-payload validator and replay driver with explicitly trusted controller
manifests and signed current-cohort envelopes. The existing single-model
`replayMethodsArchiveV2` remains a separate closed N4MM execution surface.

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

Custom app hosts can inspect `capabilityManifest()`, `controllerCapabilities`,
`runtimeSurfaces`, and `runtimeContracts` before rendering graph nodes or
selecting a runtime. The manifest schema is `nirs4all-core.capabilities.v1`; it
exposes the stable V1 controller IDs for Kennard-Stone, SNV, Savitzky-Golay,
PLS regression, and the portable methods pipeline, with parameter lists
matching the executable parser. `runtimeContracts` also makes explicit that
standalone serialized-model prediction is available on the WASM and Rust
surfaces.

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
