# Frozen Core0.5 source reference — tests only

`execution.js` is the exact named pre-count-refusal oracle, SHA256
`dcc35fbe1a741764864c75786172362949e79815c862a014a08eafe535bee962`.
It and its two static source dependencies were copied verbatim from
`phase3-methods-n-train-build-20261108/host-k4-stage/core-count-refusal/oracles/quali-core-0.5-pre-count-refusal/package/src/`.
`PROVENANCE.json` records their exact hashes, lengths and original package license
`(CECILL-2.1 OR AGPL-3.0-or-later)`.

Only the existing historical comparisons in `nirs4all-core.test.ts` and
`custom-app-host.contract.test.ts` import this reference. Production modules must
not import it. It is not a new bank qualification, replay route or compatibility
export. No model, WASM/kernel, numeric fixture or generated numerical result is
copied. Assertions, scientific values and tolerances remain in their existing
tests/fixtures.

The small local `index.js` is explicitly **new test wiring**, not the original
Core index. It exports the frozen parser closure in `pipeline-loader.js`.
That module retains the original owner's import statements, alias constant/set,
Methods cache/loader, `loadPipelineDefinition`, `portableClassNames` and their
text/root/comment/class helpers as exact source blocks. PROVENANCE.json records
the full original index hash and each block's line range, byte length and hash.
No parser body, alias value or admission rule was newly authored or changed.

The only new module wiring imports the current public `loadMethodsWasm` as the
module-supplying `loadMethods` dependency of the original cached loader. The
existing `yaml` dependency remains the original owner parser's dependency; no
package or dependency change is introduced. Historical recipe parsing no longer
calls the current Core loader, whose accepted retirement removes the alias
allowlist. Kernel identity still comes from Root's chosen matched Methods cohort;
freezing source alone does not establish numerical parity.

This bounded copy keeps an isolated checkout testable without a Root-only path,
environment selector, new loader/framework or installed legacy package. No
author executed it. Root may run the historical comparisons explicitly later;
they are separate from the one current-bank production qualification.
