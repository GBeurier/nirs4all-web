import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function joinClassNames(...classNames) {
    const resolved = classNames.filter(Boolean);
    return resolved.length > 0 ? resolved.join(" ") : undefined;
}
export function RankingsTable({ rows, metricLabel = "Score", headers, className, theadClassName, rowClassName, highlightRowClassName, cellClassName, rankClassName, nameClassName, scoreClassName, empty, }) {
    if (rows.length === 0)
        return empty == null ? null : _jsx(_Fragment, { children: empty });
    const hasDetail = rows.some((row) => row.detail != null);
    return (_jsxs("table", { className: className, children: [_jsx("thead", { className: theadClassName, children: _jsxs("tr", { children: [_jsx("th", { className: rankClassName, children: headers?.rank ?? "#" }), _jsx("th", { className: nameClassName, children: headers?.name ?? "Name" }), _jsx("th", { className: scoreClassName, children: metricLabel }), hasDetail ? _jsx("th", { className: cellClassName, children: headers?.detail ?? "Detail" }) : null] }) }), _jsx("tbody", { children: rows.map((row) => (_jsxs("tr", { className: row.highlight
                        ? joinClassNames(rowClassName, highlightRowClassName)
                        : rowClassName, "data-highlight": row.highlight ? "true" : undefined, children: [_jsx("td", { className: rankClassName, children: row.rank }), _jsx("th", { className: nameClassName, scope: "row", children: row.name }), _jsx("td", { className: scoreClassName, children: row.score }), hasDetail ? _jsx("td", { className: cellClassName, children: row.detail }) : null] }, `${row.rank}-${row.name}`))) })] }));
}
//# sourceMappingURL=RankingsTable.js.map