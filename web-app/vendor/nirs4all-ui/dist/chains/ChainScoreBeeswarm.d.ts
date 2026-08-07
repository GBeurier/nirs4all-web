import { type PlotPadding } from "../viz/geometry.js";
import type { ChainEffectAnalysis } from "./types.js";
export interface ChainScoreBeeswarmProps {
    analysis: ChainEffectAnalysis;
    /** Split the corpus on the presence of this token. */
    focusToken: string;
    width?: number;
    height?: number;
    padding?: PlotPadding;
    /** Subsample dots above this count (medians stay exact). Default: draw all. */
    maxPoints?: number;
    withColor?: string;
    withoutColor?: string;
    title?: string;
    className?: string;
}
/**
 * Two-lane distribution comparison — the honest "does this node shift the whole
 * distribution?" picture that complements the forest's point estimate. Every
 * chain is a dot on a shared goodness axis (higher = better), split into a
 * *with* lane and a *without* lane for the focus token, each with a median line
 * and an IQR band. A dashed baseline marks the corpus median. Pure inline SVG.
 */
export declare function ChainScoreBeeswarm({ analysis, focusToken, width, height, padding, maxPoints, withColor, withoutColor, title, className, }: ChainScoreBeeswarmProps): import("react").JSX.Element;
//# sourceMappingURL=ChainScoreBeeswarm.d.ts.map