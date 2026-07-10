import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { STRINGS } from "./locale.js";
const MODES = ["train_test", "train_only", "train_val_test", "folds"];
const BUCKET_TONE = {
    train: "x",
    test: "partition",
    validation: "y",
};
/** Train/test/validation/folds counters shown under the central panel. */
export function PartitionPreview({ preview, onModeChange, locale = "fr", className }) {
    const t = STRINGS[locale];
    return (_jsxs("section", { className: cx("dsb-partition", className), "aria-label": t.partitionTitle, children: [_jsxs("div", { className: "dsb-partition__head", children: [_jsx("h3", { className: "dsb-partition__title", children: t.partitionTitle }), _jsx("div", { className: "dsb-partition__modes", role: "group", children: MODES.map((mode) => (_jsx("button", { type: "button", className: "dsb-chip", "data-active": preview.mode === mode || undefined, onClick: onModeChange ? () => onModeChange(mode) : undefined, disabled: !onModeChange, children: t.partitionModes[mode] }, mode))) })] }), !preview.detected && preview.mode !== "train_only" ? (_jsx("p", { className: "dsb-partition__note", children: locale === "en"
                    ? "No partition column detected — an 80/20 split is estimated."
                    : "Aucune partition détectée — un split 80/20 est estimé." })) : preview.columnName ? (_jsxs("p", { className: "dsb-partition__note", children: [locale === "en" ? "From column " : "D'après la colonne ", _jsx("code", { children: preview.columnName })] })) : null, _jsx("div", { className: "dsb-partition__buckets", children: preview.buckets.map((bucket) => (_jsxs("div", { className: "dsb-partition__bucket", "data-role": BUCKET_TONE[bucket.id] ?? "group", children: [_jsx("span", { className: "dsb-partition__bucket-label", children: bucket.label }), _jsx("strong", { className: "dsb-partition__bucket-count", children: bucket.count.toLocaleString("fr-FR") }), _jsxs("span", { className: "dsb-partition__bucket-ratio", children: [bucket.count.toLocaleString("fr-FR"), " ", t.rows, " \u00B7 ", Math.round(bucket.ratio * 100), " %"] }), _jsx("span", { className: "dsb-partition__bucket-bar", style: { width: `${Math.round(bucket.ratio * 100)}%` } })] }, bucket.id))) })] }));
}
//# sourceMappingURL=PartitionPreview.js.map