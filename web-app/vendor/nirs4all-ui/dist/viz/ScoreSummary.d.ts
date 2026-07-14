/** One big-number score tile. */
export interface ScoreStat {
    label: string;
    value: string;
    delta?: string;
    tone?: "positive" | "negative" | "neutral";
}
export interface ScoreSummaryProps {
    stats: readonly ScoreStat[];
    columns?: number;
    tileWidth?: number;
    tileHeight?: number;
    gap?: number;
    title?: string;
    className?: string;
}
/**
 * Compact grid of metric stat tiles — the big-number score cards from Studio's
 * ScoreCardTree and the Web ResultsList, rendered as one presentational SVG so
 * it composes like the other viz charts. Hosts pass pre-formatted strings.
 */
export declare function ScoreSummary({ stats, columns, tileWidth, tileHeight, gap, title, className, }: ScoreSummaryProps): import("react").JSX.Element;
//# sourceMappingURL=ScoreSummary.d.ts.map