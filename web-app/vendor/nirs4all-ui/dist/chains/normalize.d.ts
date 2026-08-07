/**
 * Score normalization — turn raw scored chains into a comparable "goodness".
 *
 * Pure, framework-free. This is the *descriptive* normalizer: the same
 * view-model tier as `viz/geometry`. The authoritative, lineage-tracked
 * normalization is a `dag-ml` coordination concern; when its artifact is
 * available the goodness is read from it verbatim ({@link file://./contract.ts})
 * and this module is bypassed.
 */
import type { ChainMetric, ChainPoint, ChainStep, ChainTokenRef, ScoredChain, ScoreLens } from "./types.js";
/** Orient a score so higher is always better. */
export declare function orientedValue(score: number, lowerIsBetter: boolean): number;
/**
 * Percentile rank of each value within the list, in `[0, 1]` (1 = largest).
 * Ties share their averaged rank. A single value maps to `0.5`.
 */
export declare function percentileRanks(values: readonly number[]): number[];
/** Sample z-score of each value (mean 0, unit sd); a zero-spread list → all 0. */
export declare function zScores(values: readonly number[]): number[];
/** First-occurrence-ordered, deduped token references for a step list. */
export declare function dedupeOrderedTokens(steps: readonly ChainStep[]): ChainTokenRef[];
/**
 * Project scored chains to comparable {@link ChainPoint}s under a lens.
 * Chains with a non-finite score should be filtered out by the caller.
 */
export declare function computeChainPoints(chains: readonly ScoredChain[], metric: ChainMetric, lens: ScoreLens): ChainPoint[];
//# sourceMappingURL=normalize.d.ts.map