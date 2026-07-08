import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from './_cx.js';
import { buildWorklistViews, } from './worklist.js';
/**
 * The HPLC / re-measure worklist table (§3 Écran 3 output) — the bridge to the
 * bench. Presentational; rows come from the pure worklist view-model.
 */
export function WorklistTable({ items, views, locale = 'fr', safetyIcons, headers, renderBarcode, className, theadClassName, rowClassName, cellClassName, safetyClassName, empty, }) {
    const rows = views ?? (items ? buildWorklistViews(items, locale) : []);
    if (rows.length === 0)
        return empty == null ? null : _jsx(_Fragment, { children: empty });
    return (_jsxs("table", { className: className, children: [headers ? (_jsx("thead", { className: theadClassName, children: _jsxs("tr", { children: [headers.rank ? _jsx("th", { children: headers.rank }) : null, headers.sampleId ? _jsx("th", { children: headers.sampleId }) : null, headers.barcode ? _jsx("th", { children: headers.barcode }) : null, headers.reason ? _jsx("th", { children: headers.reason }) : null, headers.safety ? _jsx("th", { children: headers.safety }) : null] }) })) : null, _jsx("tbody", { children: rows.map((row) => {
                    const icon = safetyIcons?.[row.safety] ?? null;
                    return (_jsxs("tr", { className: rowClassName, "data-sample-id": row.sampleId, "data-safety": row.safety, children: [headers?.rank ? _jsx("td", { className: cellClassName, children: row.rank ?? '' }) : null, _jsx("td", { className: cellClassName, children: row.sampleId }), headers?.barcode ? (_jsx("td", { className: cellClassName, children: row.barcode
                                    ? (renderBarcode ? renderBarcode(row.barcode, row) : row.barcode)
                                    : '' })) : null, headers?.reason ? _jsx("td", { className: cellClassName, children: row.reasonLabel ?? '' }) : null, _jsxs("td", { className: cx(cellClassName, safetyClassName, row.safetyColorClass), children: [icon ? _jsx("span", { children: icon }) : null, _jsx("span", { children: row.safetyLabel })] })] }, row.sampleId));
                }) })] }));
}
//# sourceMappingURL=WorklistTable.js.map