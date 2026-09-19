# Browser model audit — 2026-09-19

Scope: the deployed demo at `https://web.nirs4all.org/` and the corrected local
production build, using the bundled public datasets and the staged native WASM.
This is execution coverage, not a comparison of predictive performance.

## Reproduced failures and corrections

- **Model-only classification:** the scheduler callback returned multiple class
  score columns with only one target name. OOF validation rejected the result.
  The callback now declares the complete class vocabulary. Real WASM tests cover
  binary and three-class classification, including unique OOF sample IDs.
- **PLS Canonical / PLS SVD:** ten default components exceeded the single target
  dimension. Defaults are now one; the backend also bounds restored component
  requests by the target width.
- **Ridge PLS:** ten components exhausted the regularized signal on the demo
  data. The initial setting is now two. Explicit larger requests are preserved;
  numerical failures identify the model and recommend reducing components.
- **ECR:** ten components caused a native internal error after the Meat
  classification preset's SNV and second derivative. The initial setting is now
  two, with a regression test using that exact preprocessing.
- **AOM-PLS / POP-PLS:** fifteen components caused convergence failures or
  expensive nested searches. Both now start at five; advanced settings remain
  editable. POP can still take several minutes on wide datasets.
- **Error reporting:** native model errors survive the scheduler boundary.
  Strict execution failures no longer claim that a fallback produced results.

The literal “unknown model” message was not reproduced during this audit.
No estimator was replaced with a different numerical implementation.

## Repeatable coverage

`web-app/tests/models-smoke.mjs` discovers models through the real editor and
checks five-fold CV, refit, finite scores and predictions, unique sample IDs,
native scheduler/provider lineage, held-out prediction rendering, and browser
errors. Each model runs in a fresh browser context and worker. By default it
uses model-only pipelines on Corn and Meat; this gate is also included in the
Pages workflow.

```bash
cd web-app
MODEL_SAMPLES=corn,beer,meat,anopheles MODEL_TIMEOUT_MS=600000 \
  MODEL_REPORT=/tmp/web-models.json npm run smoke -- models-smoke.mjs
MODEL_SAMPLES=meat,anopheles MODEL_PREPROCESSING=preset MODEL_TIMEOUT_MS=600000 \
  MODEL_REPORT=/tmp/web-model-presets.json npm run smoke -- models-smoke.mjs
```

Validation completed: 202 unit tests, TypeScript checks, catalog ABI validation,
served and single-file builds, 26 other self-contained browser smokes, and the
offline single-file load/run/predict smoke.

All **88 model-only cases passed**: 24 models each on Corn and Beer, and 20 each
on Meat and Anopheles. The final ECR defaults were rechecked after the broader
matrix run. POP-PLS on Anopheles took about 193 seconds in the model-only run;
the earlier three-minute timeout was insufficient, rather than a native crash.
An additional **40 classification cases passed with the sample presets** retained
on Meat and Anopheles (autonomous operator-selection models clear preprocessing
through the editor as usual). ECR also passed all four sample presets separately.

The two cross-runtime smokes (`converted-predictions-render` and
`performance-compare`) require external oracle artifacts and are not included
in that browser-smoke count. Arbitrary uploaded datasets and all advanced
parameter combinations are outside this finite audit. These results describe
the corrected production build before publication; the Pages workflow gates
deployment with the catalog model smoke above.
