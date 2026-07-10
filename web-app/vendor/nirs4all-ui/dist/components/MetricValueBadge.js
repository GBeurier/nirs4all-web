import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatMetricDisplayName, formatMetricValue, getMetricDefinition, isBetterScore, parseScoreNumber, } from "../score/index.js";
function resolveComparison(value, compareTo, metric) {
    const parsedValue = parseScoreNumber(value);
    const parsedComparison = parseScoreNumber(compareTo);
    if (parsedValue == null || parsedComparison == null)
        return null;
    if (parsedValue === parsedComparison)
        return "equal";
    return isBetterScore(parsedValue, parsedComparison, metric) ? "better" : "worse";
}
function joinClassNames(...classNames) {
    const resolved = classNames.filter(Boolean);
    return resolved.length > 0 ? resolved.join(" ") : undefined;
}
export function MetricValueBadge({ metric, value, compareTo, label, className, metricClassName, valueClassName, directionClassName, betterClassName, worseClassName, equalClassName, title, showDirection = true, }) {
    const definition = getMetricDefinition(metric);
    const displayLabel = label ?? definition?.abbreviation ?? formatMetricDisplayName(metric);
    const comparison = resolveComparison(value, compareTo, metric);
    const comparisonClassName = comparison === "better"
        ? betterClassName
        : comparison === "worse"
            ? worseClassName
            : comparison === "equal"
                ? equalClassName
                : undefined;
    return (_jsxs("span", { className: joinClassNames(className, comparisonClassName), "data-metric": definition?.key ?? metric ?? undefined, title: title, children: [_jsx("span", { className: metricClassName, children: displayLabel }), _jsx("strong", { className: valueClassName, children: formatMetricValue(value, metric ?? undefined) }), showDirection && comparison ? (_jsx("span", { className: directionClassName, children: comparison })) : null] }));
}
//# sourceMappingURL=MetricValueBadge.js.map