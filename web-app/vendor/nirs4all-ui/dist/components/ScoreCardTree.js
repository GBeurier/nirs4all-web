import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ScoreCardTree({ nodes, defaultOpen = true, renderMetric, className, nodeClassName, summaryClassName, labelClassName, kindClassName, metricsClassName, metricClassName, metricLabelClassName, metricValueClassName, childrenClassName, empty, }) {
    if (nodes.length === 0)
        return empty == null ? null : _jsx(_Fragment, { children: empty });
    function renderMetrics(metrics) {
        if (metrics.length === 0)
            return null;
        return (_jsx("span", { className: metricsClassName, children: metrics.map((metric) => (_jsx("span", { className: metricClassName, "data-tone": metric.tone, children: renderMetric ? renderMetric(metric) : (_jsxs(_Fragment, { children: [_jsx("span", { className: metricLabelClassName, children: metric.label }), _jsx("span", { className: metricValueClassName, children: metric.value })] })) }, metric.label))) }));
    }
    function renderNode(node) {
        const metrics = node.metrics ?? [];
        const children = node.children ?? [];
        return (_jsxs("details", { className: nodeClassName, "data-kind": node.kind, open: defaultOpen, children: [_jsxs("summary", { className: summaryClassName, children: [_jsx("span", { className: labelClassName, children: node.label }), node.kind ? _jsx("span", { className: kindClassName, children: node.kind }) : null, renderMetrics(metrics)] }), children.length > 0 ? (_jsx("div", { className: childrenClassName, children: children.map(renderNode) })) : null] }, node.id));
    }
    return _jsx("div", { className: className, children: nodes.map(renderNode) });
}
//# sourceMappingURL=ScoreCardTree.js.map