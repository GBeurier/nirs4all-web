/**
 * Chain-effect analysis — descriptive aggregation over comparable chains.
 *
 * Pure, framework-free. Given {@link ChainPoint}s (goodness already computed by
 * a lens, whether descriptive or authoritative), this derives the per-token
 * effects, the position matrix (early / mid / late, 1st vs 2nd …), the
 * predecessor × successor sequence matrix ("MSC after SNV?"), and per-token
 * neighbour contexts. Every aggregate is a robust median/IQR over goodness and
 * is gated by a minimum sample count so noise is not over-read.
 */
import type { ChainEffectAnalysis, ChainMetric, ChainPoint, ChainStepRole, NodeFlow, NodeNeighborhood, PositionMatrix, PositionMode, ScoredChain, ScoreLens, SequenceMatrix, Stat, TokenContexts } from "./types.js";
/** Five-number summary + `n` of the finite values (empty → `n = 0`). */
export declare function stat(values: readonly number[]): Stat;
export interface BuildAnalysisMeta {
    metric: ChainMetric;
    lens: ScoreLens;
    /** Reference goodness; defaults to the global median (authoritative override). */
    baseline?: number | undefined;
}
/** Assemble a full {@link ChainEffectAnalysis} from pre-normalized points. */
export declare function buildAnalysis(points: readonly ChainPoint[], meta: BuildAnalysisMeta): ChainEffectAnalysis;
/**
 * Descriptive analysis straight from raw scored chains — the non-authoritative
 * fallback used until `dag-ml` emits the native artifact. Drops chains whose
 * score is non-finite (boundary validation).
 */
export declare function fromScoredChains(chains: readonly ScoredChain[], options: {
    metric: ChainMetric;
    lens: ScoreLens;
}): ChainEffectAnalysis;
export interface PositionMatrixOptions {
    /** Default `"phase"` (Early/Mid/Late) — handles variable-length chains. */
    mode?: PositionMode;
    /** Absolute-mode bucket cap; the last bucket is "kth+". Default `5`. */
    maxAbsolute?: number;
    /** Minimum chains per cell; below this the cell is `null`. Default `3`. */
    minCount?: number;
    /** Roles whose ordering defines the "transform stack". Default preprocess/feature/augmentation. */
    roles?: readonly ChainStepRole[];
    /** Restrict/order rows to these tokens; default all tokens of `roles`. */
    tokens?: readonly string[];
}
/** Token × position goodness matrix — answers "is MSC better 1st or 2nd?". */
export declare function positionMatrix(analysis: ChainEffectAnalysis, options?: PositionMatrixOptions): PositionMatrix;
export interface SequenceMatrixOptions {
    roles?: readonly ChainStepRole[];
    minCount?: number;
    /** Consecutive in the transform stack (vs anywhere-before). Default `false`. */
    adjacentOnly?: boolean;
    tokens?: readonly string[];
    /** Cap the matrix to the top-N tokens by coverage. Default `8`. */
    maxTokens?: number;
}
/** Predecessor × successor goodness matrix — answers "MSC after SNV?". */
export declare function sequenceMatrix(analysis: ChainEffectAnalysis, options?: SequenceMatrixOptions): SequenceMatrix;
export interface TokenContextsOptions {
    roles?: readonly ChainStepRole[];
    minCount?: number;
    /** Cap each list to the top-K by median goodness. Default: unbounded. */
    topK?: number;
}
/** Best/worst neighbours around a focus token (explorer detail panel). */
export declare function tokenContexts(analysis: ChainEffectAnalysis, focusToken: string, options?: TokenContextsOptions): TokenContexts;
export interface NodeNeighborsOptions {
    /** Neighbour roles to include. Default: every role present. */
    roles?: readonly ChainStepRole[] | undefined;
    /** Minimum shared chains for a neighbour to appear. Default `1`. */
    minCount?: number;
    /** Keep the top-N neighbours by link weight; the rest fold into "others". Default `9`. */
    maxNeighbors?: number;
}
/**
 * Co-occurrence neighbourhood of a focus node: every token that shares a chain
 * with it, weighted by the number of shared chains and scored by the goodness
 * of those shared chains (the *combined* effect). Drives {@link ChainNodeOrbit}.
 * Returns `null` when the focus token is unknown.
 */
export declare function nodeNeighbors(analysis: ChainEffectAnalysis, focusToken: string, options?: NodeNeighborsOptions): NodeNeighborhood | null;
export interface NodeFlowOptions {
    /** Step roles to include. Default: every role present. */
    roles?: readonly ChainStepRole[] | undefined;
    /** Minimum chains for a wedge to appear. Default `1`. */
    minCount?: number;
    /** Outward successor levels (1–3). Default `2`. */
    depth?: number;
    /** Keep the top-N children per node; the rest drop. Default `6`. */
    maxPerLevel?: number;
    /** Cap the inner predecessor ring. Default `6`. */
    maxPredecessors?: number;
}
/**
 * Directional flow around a focus node: the predecessors that lead into it (one
 * inner ring) and the *real ordered continuations* that follow it, expanded as
 * a bounded successor tree (each path `focus → a → b` is an actual chain
 * sub-sequence that occurred, weighted by its chain count). Drives the
 * multi-ring {@link ChainNodeOrbit} sunburst; returns `null` for an unknown
 * focus.
 */
export declare function nodeFlow(analysis: ChainEffectAnalysis, focus: string | readonly string[], options?: NodeFlowOptions): NodeFlow | null;
//# sourceMappingURL=analysis.d.ts.map