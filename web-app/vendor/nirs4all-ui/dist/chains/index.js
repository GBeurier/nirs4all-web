/**
 * nirs4all-ui `chains` domain — the chain-effect explorer.
 *
 * Turns a corpus of *hundreds* of executed linear pipelines ("chains", e.g.
 * `SNV → SavGol → PLS`), each with a comparable score, into the influence of
 * each node: a global ranking (which steps help / hurt), a position profile
 * (early / mid / late, 1st vs 2nd), an order matrix ("MSC after SNV?"), and a
 * with/without distribution shift — across datasets and sources (multisource,
 * multimodal). Per-dataset rank / z normalization makes heterogeneous datasets
 * comparable.
 *
 * Same package boundary as the rest of nirs4all-ui: presentational + local UI
 * state only — NO app state, network/IO, storage, or runtime execution. The
 * *authoritative* analysis (per-dataset normalization with lineage) is a
 * coordination concern that lives native in `dag-ml`; this domain renders its
 * serialized artifact via {@link parseChainEffectAnalysis} and also ships a
 * descriptive {@link fromScoredChains} adapter (the `viz/geometry` tier) so
 * hosts can render from a raw scored-chain list today. A default stylesheet
 * ships at `nirs4all-ui/assets/chains.css`.
 *
 * Consumed as `nirs4all-ui/chains`.
 */
// --- view-model contract + role vocabulary ---
export * from "./types.js";
// --- palette (reuses the viz teal system) ---
export { CHAIN_ROLE_COLORS, roleColor, effectColor, effectTextColor } from "./colors.js";
// --- pure engine (reusable by hosts / tests) ---
export { orientedValue, percentileRanks, zScores, computeChainPoints, dedupeOrderedTokens } from "./normalize.js";
export { stat, buildAnalysis, fromScoredChains, positionMatrix, sequenceMatrix, tokenContexts, nodeNeighbors, nodeFlow, } from "./analysis.js";
// --- serialized dag-ml artifact seam ---
export { CHAIN_EFFECT_SCHEMA_ID, CHAIN_EFFECT_SCHEMA_VERSION, isChainEffectAnalysisArtifact, parseChainEffectAnalysis, toChainEffectArtifact, } from "./contract.js";
// --- presentational charts ---
export { NodeEffectForest } from "./NodeEffectForest.js";
export { PositionEffectHeatmap } from "./PositionEffectHeatmap.js";
export { SequenceEffectHeatmap } from "./SequenceEffectHeatmap.js";
export { ChainScoreBeeswarm } from "./ChainScoreBeeswarm.js";
// --- the interactive explorers ---
export { ChainExplorer } from "./ChainExplorer.js";
export { ChainNodeOrbit } from "./ChainNodeOrbit.js";
export { ChainNodeHub } from "./ChainNodeHub.js";
//# sourceMappingURL=index.js.map