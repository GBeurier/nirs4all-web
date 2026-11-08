import type { Matrix } from "./types.js";
export type RankingMethod = "average_rank" | "elo" | "bradley_terry" | "trueskill" | "trueskill_1v1" | "openskill" | "weng_lin_bradley_terry";
export interface RankingOptions {
    method?: RankingMethod;
    higher_is_better?: boolean;
    tie_tolerance?: number;
    initial_mean?: number;
    k_factor?: number;
    elo_scale?: number;
    prior_sigma?: number;
    beta?: number;
    dynamics?: number;
    draw_margin?: number;
    regularization?: number;
    convergence_tolerance?: number;
    max_iterations?: number;
}
export interface RankingCandidate {
    index: number;
    score: number | null;
    uncertainty: number | null;
    average_rank: number | null;
    observations: number;
    matches: number;
    component: number;
    wins: number;
    ties: number;
    losses: number;
    rank: number | null;
}
export interface RankingResult {
    schema_version: "n4m.ranking/1";
    method: RankingMethod;
    variant: string;
    options: Required<Omit<RankingOptions, "method">>;
    score_direction: "lower_is_better" | "higher_is_better";
    uncertainty_kind: "approximate_posterior_sd" | null;
    candidates: RankingCandidate[];
    coverage: {
        blocks: number;
        complete_blocks: number;
        paired_comparisons: number;
        connected_components: number;
    };
    inference: {
        friedman_statistic: number | null;
        degrees_of_freedom: number | null;
        friedman_p_value: number | null;
        p_value_method: "chi_square_approximation";
        reason: string;
    };
    warnings: string[];
    convergence: {
        converged: boolean;
        iterations: number;
    };
}
/** Rank candidates in columns across comparable blocks in rows. The required
 * row-major presence mask contains 0 or 1; masked scores may be nonfinite.
 * Bayesian uncertainty is an approximate posterior SD, not a standard error. */
export declare function rank(scores: Matrix, present: Uint8Array, options?: RankingOptions): RankingResult;
