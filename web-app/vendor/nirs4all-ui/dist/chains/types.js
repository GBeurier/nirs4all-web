/**
 * Package-level view-model contract for the chain-effect explorer.
 *
 * A "chain" is one executed *linear* pipeline — an ordered sequence of steps
 * (e.g. `SNV → SavGol → PLS`) that produced a comparable score (nRMSE, RMSE,
 * R², …) on some dataset/source. This domain turns a corpus of *hundreds* of
 * scored chains into the influence of each node: how much a step helps or
 * hurts globally, whether it is better early / mid / late in the chain, and
 * whether its effect depends on what precedes it (e.g. "MSC after SNV").
 *
 * This is a small, framework-free contract — deliberately NOT a dependency on
 * `dag-ml`. The *authoritative* analysis (per-dataset score normalization with
 * lineage) is a coordination concern that lives native in `dag-ml`; this
 * package renders its serialized artifact (see {@link file://./contract.ts})
 * and also ships a descriptive {@link file://./analysis.ts fromScoredChains}
 * adapter — the same view-model tier as `viz/geometry` — so hosts can render
 * from a raw scored-chain list before the native producer exists.
 */
/** Human-facing role labels for legends and chips. */
export const CHAIN_ROLE_LABELS = {
    split: "Split / CV",
    preprocess: "Preprocess",
    feature: "Feature",
    model: "Model",
    augmentation: "Augmentation",
    target: "Target",
    other: "Other",
};
/** Stable display order for roles (used when listing/grouping). */
export const CHAIN_ROLE_ORDER = [
    "split",
    "preprocess",
    "feature",
    "augmentation",
    "model",
    "target",
    "other",
];
/** Roles whose *order* is meaningful — the "transform stack" of a chain. */
export const CHAIN_TRANSFORM_ROLES = ["preprocess", "feature", "augmentation"];
/** Short labels for each normalization lens. */
export const CHAIN_LENS_LABELS = {
    raw: "Raw score",
    rankByDataset: "Rank in dataset",
    zByDataset: "Z in dataset",
};
const VALID_ROLES = new Set(CHAIN_ROLE_ORDER);
/** Coerce an arbitrary role string to a known {@link ChainStepRole}. */
export function coerceChainRole(role) {
    return role && VALID_ROLES.has(role) ? role : "other";
}
//# sourceMappingURL=types.js.map