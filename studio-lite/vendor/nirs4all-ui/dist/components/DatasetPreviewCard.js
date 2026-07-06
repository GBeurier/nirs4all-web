import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { buildDatasetPreview, } from "../dataset/index.js";
function resolveClassName(className, item) {
    return typeof className === "function" ? className(item) : className;
}
function defaultStatNode(stat, labelClassName, valueClassName, detailClassName) {
    return (_jsxs(_Fragment, { children: [_jsx("dt", { className: labelClassName, children: stat.label }), _jsx("dd", { className: valueClassName, children: stat.value }), stat.detail ? _jsx("span", { className: detailClassName, children: stat.detail }) : null] }));
}
export function DatasetPreviewCard({ dataset, view, className, headerClassName, titleClassName, descriptionClassName, badgeListClassName, badgeClassName, statListClassName, statClassName, statLabelClassName, statValueClassName, statDetailClassName, empty, renderBadge, renderStat, }) {
    const preview = view ?? buildDatasetPreview(dataset);
    if (!preview)
        return empty == null ? null : _jsx(_Fragment, { children: empty });
    return (_jsxs("article", { className: className, "data-dataset-id": preview.id ?? undefined, children: [_jsxs("header", { className: headerClassName, children: [_jsx("strong", { className: titleClassName, children: preview.title }), preview.description ? (_jsx("p", { className: descriptionClassName, children: preview.description })) : null] }), preview.badges.length > 0 ? (_jsx("div", { className: badgeListClassName, children: preview.badges.map((badge) => (_jsx("span", { className: resolveClassName(badgeClassName, badge), children: renderBadge ? renderBadge(badge) : badge.label }, badge.id))) })) : null, preview.stats.length > 0 ? (_jsx("dl", { className: statListClassName, children: preview.stats.map((stat) => (_jsx("div", { className: resolveClassName(statClassName, stat), children: renderStat
                        ? renderStat(stat)
                        : defaultStatNode(stat, statLabelClassName, statValueClassName, statDetailClassName) }, stat.id))) })) : null] }));
}
//# sourceMappingURL=DatasetPreviewCard.js.map