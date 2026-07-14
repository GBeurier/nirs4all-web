import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { bandPath, buildFrame, extentOf, linePath, makeScale, niceExtent, round, ticks, } from "./geometry.js";
import { N4_PARTITION_COLORS, N4_VIZ_COLORS } from "./theme.js";
function partitionColor(series) {
    if (series.color)
        return series.color;
    if (series.partition)
        return N4_PARTITION_COLORS[series.partition];
    return N4_VIZ_COLORS.teal;
}
function formatTick(value) {
    if (Math.abs(value) >= 1000)
        return value.toFixed(0);
    if (Math.abs(value) >= 1)
        return value.toFixed(1);
    return value.toFixed(2);
}
/**
 * The signature NIRS chart: absorbance vs. wavelength. Overlays per-sample
 * lines (colored by partition), an optional emphasized mean, and a translucent
 * min/max band. Pure inline SVG — no chart library, no state. Hosts pass
 * already-aligned numeric arrays.
 */
export function SpectraPlot({ wavelengths, series = [], mean, band, width = 520, height = 260, padding, unit = "nm", xLabel, yLabel = "Absorbance", showGrid = true, showAxes = true, meanColor = N4_VIZ_COLORS.tealDark, title = "NIRS spectra", className, children, }) {
    const frame = buildFrame(width, height, padding);
    const { top, left } = frame.padding;
    const bottom = top + frame.innerHeight;
    const xDomain = extentOf(wavelengths);
    const allValues = [
        ...series.flatMap((s) => s.values),
        ...(mean ?? []),
        ...(band ? [...band.lower, ...band.upper] : []),
    ];
    const yDomain = niceExtent(allValues.length ? allValues : [0, 1], 0.08);
    const xScale = makeScale(xDomain, left, left + frame.innerWidth);
    const yScale = makeScale(yDomain, bottom, top);
    const toPoints = (values) => wavelengths.map((wl, i) => [xScale(wl), yScale(values[i] ?? 0)]);
    const xTicks = ticks(xDomain, 5);
    const yTicks = ticks(yDomain, 4);
    const resolvedXLabel = xLabel ?? `Wavelength (${unit})`;
    return (_jsxs("svg", { className: cx("n4viz", "n4viz-spectra", className), viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), showGrid
                ? yTicks.map((t) => (_jsx("line", { className: "n4viz-grid", x1: left, x2: left + frame.innerWidth, y1: round(yScale(t)), y2: round(yScale(t)) }, `gy-${t}`)))
                : null, band ? (_jsx("path", { className: "n4viz-band", d: bandPath(toPoints(band.upper), toPoints(band.lower)), fill: band.color ?? N4_VIZ_COLORS.teal, fillOpacity: band.opacity ?? 0.12, stroke: "none" })) : null, series.map((s) => (_jsx("path", { className: "n4viz-line", d: linePath(toPoints(s.values)), fill: "none", stroke: partitionColor(s), strokeOpacity: s.opacity ?? 0.5, strokeWidth: 1 }, s.id))), mean ? (_jsx("path", { className: "n4viz-line n4viz-line-mean", d: linePath(toPoints(mean)), fill: "none", stroke: meanColor, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" })) : null, showAxes ? (_jsxs(_Fragment, { children: [_jsx("line", { className: "n4viz-axis", x1: left, x2: left + frame.innerWidth, y1: bottom, y2: bottom }), _jsx("line", { className: "n4viz-axis", x1: left, x2: left, y1: top, y2: bottom }), xTicks.map((t) => (_jsx("text", { className: "n4viz-tick", x: round(xScale(t)), y: bottom + 16, textAnchor: "middle", children: formatTick(t) }, `tx-${t}`))), yTicks.map((t) => (_jsx("text", { className: "n4viz-tick", x: left - 6, y: round(yScale(t)) + 3, textAnchor: "end", children: formatTick(t) }, `ty-${t}`))), _jsx("text", { className: "n4viz-axis-label", x: left + frame.innerWidth / 2, y: height - 2, textAnchor: "middle", children: resolvedXLabel }), _jsx("text", { className: "n4viz-axis-label", transform: `translate(11 ${top + frame.innerHeight / 2}) rotate(-90)`, textAnchor: "middle", children: yLabel })] })) : null, children] }));
}
//# sourceMappingURL=SpectraPlot.js.map