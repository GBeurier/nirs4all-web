import type { ChainEffectAnalysis, ChainStepRole } from "./types.js";
export interface ChainNodeHubProps {
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
 * Chain hub navigator — the twin of {@link ChainNodeOrbit} with the focus on
 * the *second* ring. The centre is a pie (camembert) of every possible
 * predecessor, a band around it is the focus node itself, and the outer rings
 * are the ordered successors (2–3 levels). Reading centre → out is pipeline
 * order: predecessors converge into the hub, successors radiate away. Rooted on
 * the whole selected chain (no loops); click a centre slice to prepend, an
 * outer wedge to append, the focus band to step back, and Reset to start over.
 */
export declare function ChainNodeHub({ analysis, defaultFocusToken, roles, depth, maxPerLevel, minCount, size, onFocusChange, title, className, roleColors, }: ChainNodeHubProps): import("react").JSX.Element;
//# sourceMappingURL=ChainNodeHub.d.ts.map