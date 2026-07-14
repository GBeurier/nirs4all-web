import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { round } from "./geometry.js";
import { N4_VIZ_COLORS } from "./theme.js";
const TONE_COLORS = {
    positive: N4_VIZ_COLORS.green,
    negative: N4_VIZ_COLORS.rose,
    neutral: N4_VIZ_COLORS.slate,
};
function toneColor(tone) {
    return TONE_COLORS[tone ?? "neutral"];
}
/**
 * Compact grid of metric stat tiles — the big-number score cards from Studio's
 * ScoreCardTree and the Web ResultsList, rendered as one presentational SVG so
 * it composes like the other viz charts. Hosts pass pre-formatted strings.
 */
export function ScoreSummary({ stats, columns = 3, tileWidth = 120, tileHeight = 76, gap = 10, title = "Scores", className, }) {
    const cols = Math.max(1, Math.trunc(columns));
    const rows = stats.length > 0 ? Math.ceil(stats.length / cols) : 0;
    const width = cols * tileWidth + (cols + 1) * gap;
    const height = rows * tileHeight + (rows + 1) * gap;
    return (_jsxs("svg", { className: cx("n4viz", "n4viz-scores", className), viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), stats.map((stat, i) => {
                const col = i % cols;
                const rowIdx = Math.floor(i / cols);
                const x = gap + col * (tileWidth + gap);
                const y = gap + rowIdx * (tileHeight + gap);
                const tone = stat.tone ?? "neutral";
                return (_jsxs("g", { className: "n4viz-stat", "data-tone": tone, children: [_jsx("rect", { className: "n4viz-stat-tile", x: round(x), y: round(y), width: round(tileWidth), height: round(tileHeight), rx: 10, fill: `color-mix(in srgb, ${toneColor(tone)} 8%, transparent)`, stroke: toneColor(tone), strokeOpacity: 0.3 }), _jsx("text", { className: "n4viz-stat-label", x: round(x + 12), y: round(y + 20), children: stat.label }), _jsx("text", { className: "n4viz-stat-value", x: round(x + 12), y: round(y + 46), children: stat.value }), stat.delta ? (_jsx("text", { className: "n4viz-stat-delta", x: round(x + 12), y: round(y + 64), fill: toneColor(tone), children: stat.delta })) : null] }, `${stat.label}-${i}`));
            })] }));
}
//# sourceMappingURL=ScoreSummary.js.map