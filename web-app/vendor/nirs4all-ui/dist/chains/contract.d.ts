/**
 * Serialized contract for the chain-effect analysis — the seam to `dag-ml`.
 *
 * The *authoritative* analysis is a coordination concern that lives native in
 * `dag-ml` (over its `ScoreSet` + `GraphPlan` node identities, with per-dataset
 * normalization and fingerprints). It serializes to the snake_case artifact
 * below — mirroring how `TuningResult` / `CalibratedRunResult` reach this
 * package. {@link parseChainEffectAnalysis} validates and projects it into the
 * camelCase {@link ChainEffectAnalysis} view-model the charts render, trusting
 * the producer's authoritative `goodness`/`baseline` verbatim. Token effects
 * and the position/sequence matrices are *derived* views, so the wire artifact
 * stays lean (metric + lens + baseline + points).
 *
 * {@link toChainEffectArtifact} does the reverse for tests, demos, and hosts
 * that want to persist the descriptive view-model in the same shape.
 */
import type { ChainEffectAnalysis } from "./types.js";
export declare const CHAIN_EFFECT_SCHEMA_ID: "https://github.com/GBeurier/dag-ml/schemas/chain_effect_analysis.v1.schema.json";
export declare const CHAIN_EFFECT_SCHEMA_VERSION: 1;
/** Wire spelling of {@link ScoreLens}. */
export type ChainEffectLensWire = "raw" | "rank_by_dataset" | "z_by_dataset";
export interface ChainEffectStepArtifact {
    token: string;
    label?: string;
    role: string;
}
export interface ChainEffectPointArtifact {
    id: string;
    score: number;
    goodness: number;
    dataset?: string | null;
    source?: string | null;
    ordered_tokens: readonly ChainEffectStepArtifact[];
}
export interface ChainEffectMetricArtifact {
    key: string;
    label: string;
    lower_is_better: boolean;
}
export interface ChainEffectAnalysisArtifact {
    schema_id: string;
    schema_version: number;
    metric: ChainEffectMetricArtifact;
    lens: ChainEffectLensWire;
    baseline?: number | null;
    points: readonly ChainEffectPointArtifact[];
}
/** Structural guard for a serialized chain-effect artifact. */
export declare function isChainEffectAnalysisArtifact(value: unknown): value is ChainEffectAnalysisArtifact;
/** Validate + project a serialized artifact into the render-ready view-model. */
export declare function parseChainEffectAnalysis(value: unknown): ChainEffectAnalysis;
/** Serialize a view-model back to the wire artifact (tests / demos / hosts). */
export declare function toChainEffectArtifact(analysis: ChainEffectAnalysis): ChainEffectAnalysisArtifact;
//# sourceMappingURL=contract.d.ts.map