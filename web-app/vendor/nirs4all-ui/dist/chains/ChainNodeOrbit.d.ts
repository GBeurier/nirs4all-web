import type { ChainEffectAnalysis, ChainStepRole } from "./types.js";
export interface ChainNodeOrbitProps {
    analysis: ChainEffectAnalysis;
    /** Starting focus node; defaults to the highest-coverage node (the hub). */
    defaultFocusToken?: string;
    /** Step roles to include. Default: every role present. */
    roles?: readonly ChainStepRole[] | undefined;
    /** Outward successor rings (1–3). Default `2`. */
    depth?: number;
    /** Keep the top-N children per node. Default `6`. */
    maxPerLevel?: number;
    /** Minimum chains for a wedge. Default `2`. */
    minCount?: number;
    size?: number;
    /** Notified whenever the focus changes (navigation). */
    onFocusChange?: (token: string) => void;
    title?: string;
    className?: string;
    roleColors?: Partial<Record<ChainStepRole, string>> | undefined;
}
/**
 * Radial flow navigator — a foldable, multi-ring sunburst. A focus node sits at
 * the centre; an inner ring shows the nodes that *precede* it, and 2–3 outer
 * rings show the *real ordered continuations* that follow (each ring one step
 * further down the pipeline), so a whole bounded chain is legible at a glance —
 * no clicking into meaningless infinity. Wedges are sized by chain count and
 * colored by the combined effect (teal = better, amber = worse). Click any
 * wedge to re-centre on that node; the breadcrumb walks back. Local UI state only.
 */
export declare function ChainNodeOrbit({ analysis, defaultFocusToken, roles, depth, maxPerLevel, minCount, size, onFocusChange, title, className, roleColors, }: ChainNodeOrbitProps): import("react").JSX.Element;
//# sourceMappingURL=ChainNodeOrbit.d.ts.map