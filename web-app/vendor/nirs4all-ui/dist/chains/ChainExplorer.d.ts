import type { ChainEffectAnalysis, ChainMetric, ChainStepRole, ScoredChain, ScoreLens } from "./types.js";
export interface ChainExplorerProps {
    /**
     * Raw scored chains (host-provided) — computed live so the lens and the
     * source/dataset/role filters stay interactive over hundreds of chains.
     */
    chains?: readonly ScoredChain[];
    /**
     * A precomputed authoritative analysis (e.g. parsed from the `dag-ml`
     * artifact). When given without `chains`, the lens is fixed to its lens and
     * only the identity filters recompute descriptive aggregates for the subset.
     */
    analysis?: ChainEffectAnalysis;
    /** Metric for the `chains` path. Default nRMSE (lower is better). */
    metric?: ChainMetric;
    defaultLens?: ScoreLens;
    defaultSelectedToken?: string;
    width?: number;
    title?: string;
    className?: string;
    roleColors?: Partial<Record<ChainStepRole, string>>;
}
/**
 * Interactive chain-effect explorer — the flagship that turns a corpus of
 * hundreds of scored chains into the influence of each node in a single
 * component. Pick a normalization lens, filter by source / dataset / role, and
 * click a node in the forest to isolate it: its with/without distribution
 * shift, its early/mid/late position profile, the predecessor × successor order
 * matrix, and its best neighbouring contexts. Local UI state only — no app
 * state, network, storage, or runtime execution. Ships with
 * `nirs4all-ui/assets/chains.css`.
 */
export declare function ChainExplorer({ chains, analysis: providedAnalysis, metric, defaultLens, defaultSelectedToken, width, title, className, roleColors, }: ChainExplorerProps): import("react").JSX.Element;
//# sourceMappingURL=ChainExplorer.d.ts.map