# Frozen native Package2 reference

These are the unchanged synthetic reference files used to qualify the Web Core V1
container import and native prediction path on 7 November 2026. They are project
test material covered by the repository license, with no experiment or user data.

The genuinely trained model contains SNV, Savitzky–Golay smoothing and PLS in an
N4MM v3 fitted state (writer ABI 2.20.0). The independent input has 12 rows and
7 features. `shared-prediction.json` contains recorded native predictions; tests
compare against those values, not target truth, with the existing absolute
CPU-to-WASM tolerance of `1e-10`. Tests never refit the model or regenerate an oracle.

`provenance.json` records the original workspace qualification and SHA-256 of each
unchanged file. The archive SHA-256 is also asserted in `src/lib/n4a-native.test.ts`.
This is a Core V1 container carrying the Package2 native model, distinct from the
historical physical Archive V2 format.

The unit tests and `prediction-export-smoke.mjs` use these files by default.
`NIRS4ALL_WEB_OWNER_FIXTURES` can select an explicit alternative directory during
owner qualification. Missing files fail the gate; they never skip this profile.
