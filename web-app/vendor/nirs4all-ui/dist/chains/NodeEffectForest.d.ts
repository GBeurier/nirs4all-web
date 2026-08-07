import { type PlotPadding } from "../viz/geometry.js";
import type { ChainEffectAnalysis, ChainStepRole } from "./types.js";
export type ForestSort = "delta" | "median" | "coverage";
export interface NodeEffectForestProps {
    analysis: ChainEffectAnalysis;
    /** Restrict to these roles (default: all present). */
    roles?: readonly ChainStepRole[];
    /** Row ordering. Default `"delta"` (biggest positive effect first). */
    sortBy?: ForestSort;
    /** Cap rows; a "+N more" note is drawn when truncated. Default `16`. */
    maxRows?: number;
    /** Highlighted token (row emphasis). */
    selectedToken?: string | null;
    /** Row click — makes the forest a node selector. */
    onSelectToken?: (token: string) => void;
    width?: number;
    rowHeight?: number;
    padding?: PlotPadding;
    title?: string;
    /** Hide the in-SVG title text (e.g. when a panel head already labels it). */
    hideTitle?: boolean;
    className?: string;
    roleColors?: Partial<Record<ChainStepRole, string>> | undefined;
}
/**
 * Forest / caterpillar plot of per-node influence — the headline "which steps
 * help" ranking. One row per token: a faint min–max whisker, a bold IQR bar,
 * and a median dot colored by its effect vs the baseline (cool = better, warm =
 * worse). A dashed baseline marks the corpus median. Rows are clickable, so the
 * forest doubles as the node selector for the explorer. Pure inline SVG.
 */
export declare function NodeEffectForest({ analysis, roles, sortBy, maxRows, selectedToken, onSelectToken, width, rowHeight, padding, title, hideTitle, className, roleColors, }: NodeEffectForestProps): import("react").JSX.Element;
//# sourceMappingURL=NodeEffectForest.d.ts.map