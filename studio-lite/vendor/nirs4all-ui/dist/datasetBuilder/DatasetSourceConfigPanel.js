import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { cx } from "./_cx.js";
import { icon } from "./icons.js";
import { STRINGS } from "./locale.js";
import { ROLE_DESCRIPTORS, SIGNAL_TYPES, roleLabel } from "./roles.js";
import { LiveValidationCard } from "./LiveValidationCard.js";
const SEPARATORS = [
    { value: "auto", labels: { fr: "Auto", en: "Auto" } },
    { value: ",", labels: { fr: ", (virgule)", en: ", (comma)" } },
    { value: ";", labels: { fr: "; (point-virgule)", en: "; (semicolon)" } },
    { value: "\t", labels: { fr: "Tabulation", en: "Tab" } },
    { value: " ", labels: { fr: "Espace", en: "Space" } },
];
const USE_AS = [
    { value: "x_train", labels: { fr: "X train", en: "X train" } },
    { value: "x_test", labels: { fr: "X test", en: "X test" } },
    { value: "x_train_test", labels: { fr: "X train + test", en: "X train + test" } },
    { value: "y_train", labels: { fr: "Y train", en: "Y train" } },
    { value: "y_test", labels: { fr: "Y test", en: "Y test" } },
    { value: "metadata", labels: { fr: "Metadata globale", en: "Global metadata" } },
    { value: "metadata_train_test", labels: { fr: "Metadata train/test", en: "Metadata train/test" } },
    { value: "join_table", labels: { fr: "Table de jointure", en: "Join table" } },
    { value: "partition", labels: { fr: "Fichier de partition", en: "Partition file" } },
    { value: "auxiliary", labels: { fr: "Source auxiliaire", en: "Auxiliary source" } },
];
/** Right-hand guided configuration for the active source. */
export function DatasetSourceConfigPanel(props) {
    const { source, validation, advanced, autoDetect, manualColumns, onUpdateParsing, onUpdateSignalType, onUpdateUseAs, onSetSingletonRole, onToggleAutoDetect, onToggleManualColumns, onUpdateAdvanced, onPreviewColumns, locale = "fr", icons, className, } = props;
    const t = STRINGS[locale];
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const isCsv = ["csv", "tsv", "txt"].includes(source.fileType.toLowerCase());
    const columnsByRole = (role) => source.columns.filter((c) => c.assignedRole === role);
    const firstOf = (role) => columnsByRole(role)[0]?.id ?? "";
    return (_jsxs("aside", { className: cx("dsb-config", className), children: [_jsxs("header", { className: "dsb-config__head", children: [_jsx("span", { className: "dsb-config__head-icon", children: icon("spark", icons) }), _jsxs("div", { children: [_jsx("strong", { className: "dsb-config__title", children: t.assistantTitle }), _jsx("p", { className: "dsb-config__subtitle", children: t.assistantSubtitle })] })] }), _jsx(Field, { label: t.signalType, children: _jsx(Select, { value: source.signalType, onChange: (v) => onUpdateSignalType(v), options: SIGNAL_TYPES.map((s) => ({ value: s.value, label: s.labels[locale] })), icons: icons }) }), isCsv ? (_jsxs("fieldset", { className: "dsb-config__group", children: [_jsx("legend", { children: t.fileFormat }), _jsxs("div", { className: "dsb-config__row", children: [_jsx(Field, { label: t.separator, compact: true, children: _jsx(Select, { value: source.parsing.separator ?? "auto", onChange: (v) => onUpdateParsing({ separator: v === "auto" ? undefined : v }), options: SEPARATORS.map((s) => ({ value: s.value, label: s.labels[locale] })), icons: icons }) }), _jsx(Field, { label: t.decimal, compact: true, children: _jsx(Select, { value: source.parsing.decimal ?? ".", onChange: (v) => onUpdateParsing({ decimal: v }), options: [
                                        { value: ".", label: locale === "en" ? ". (dot)" : ". (point)" },
                                        { value: ",", label: locale === "en" ? ", (comma)" : ", (virgule)" },
                                    ], icons: icons }) })] }), _jsx(Field, { label: t.headers, children: _jsx("div", { className: "dsb-toggle-group", role: "group", children: ["horizontal", "vertical"].map((mode) => (_jsx("button", { type: "button", className: "dsb-toggle", "data-active": (source.parsing.headerMode ?? "horizontal") === mode || undefined, onClick: () => onUpdateParsing({ headerMode: mode }), children: mode === "horizontal" ? t.headersHorizontal : t.headersVertical }, mode))) }) })] })) : null, _jsxs("fieldset", { className: "dsb-config__group", children: [_jsx("legend", { children: t.columnChoice }), ["id", "replicate", "partition"].map((role) => (_jsx(Field, { label: roleLabel(role, locale), role: role, compact: true, children: _jsx(Select, { value: firstOf(role), onChange: (v) => onSetSingletonRole(role, v), options: [
                                { value: "", label: locale === "en" ? "— none —" : "— aucune —" },
                                ...source.columns.map((c) => ({ value: c.id, label: c.name })),
                            ], icons: icons }) }, role))), _jsx(RoleSummaryField, { label: roleLabel("x", locale), role: "x", columns: columnsByRole("x"), onPreview: onPreviewColumns, locale: locale, icons: icons }), _jsx(RoleSummaryField, { label: roleLabel("y", locale), role: "y", columns: columnsByRole("y"), onPreview: onPreviewColumns, locale: locale, icons: icons })] }), _jsx(Field, { label: t.useAs, children: _jsx(Select, { value: source.usage.useAs ?? "x_train", onChange: (v) => onUpdateUseAs(v), options: USE_AS.map((u) => ({ value: u.value, label: u.labels[locale] })), icons: icons }) }), _jsxs("div", { className: "dsb-config__switches", children: [_jsx(Switch, { label: t.autoDetect, checked: autoDetect, onChange: onToggleAutoDetect }), _jsx(Switch, { label: t.manualColumns, checked: manualColumns, onChange: onToggleManualColumns })] }), _jsxs("details", { className: "dsb-config__advanced", open: advancedOpen, onToggle: (e) => setAdvancedOpen(e.target.open), children: [_jsx("summary", { children: t.advanced }), _jsxs("div", { className: "dsb-config__advanced-body", children: [_jsx(Field, { label: locale === "en" ? "Join strategy" : "Stratégie de jointure", compact: true, children: _jsx(Select, { value: advanced.joinStrategy, onChange: (v) => onUpdateAdvanced({ joinStrategy: v }), options: [
                                        { value: "inner", label: "inner join" },
                                        { value: "left", label: "left join" },
                                        { value: "strict", label: locale === "en" ? "strict match" : "strict match" },
                                        { value: "allow_missing", label: locale === "en" ? "allow missing" : "autoriser manquants" },
                                    ], icons: icons }) }), _jsx(Field, { label: locale === "en" ? "Replicates" : "Répétitions", compact: true, children: _jsx(Select, { value: advanced.replicateStrategy, onChange: (v) => onUpdateAdvanced({ replicateStrategy: v }), options: [
                                        { value: "keep", label: locale === "en" ? "keep" : "garder" },
                                        { value: "average", label: locale === "en" ? "average" : "moyenner" },
                                        { value: "stack", label: locale === "en" ? "stack" : "empiler" },
                                        { value: "augment", label: locale === "en" ? "augmentation" : "augmentation" },
                                        { value: "hierarchy", label: locale === "en" ? "hierarchy level" : "niveau hiérarchique" },
                                    ], icons: icons }) }), _jsx(Field, { label: locale === "en" ? "Multi-source alignment" : "Alignement multi-source", compact: true, children: _jsx(Select, { value: advanced.multiSourceAlign, onChange: (v) => onUpdateAdvanced({ multiSourceAlign: v }), options: [
                                        { value: "sample_id", label: "sample_id" },
                                        { value: "plot_id", label: "plot_id" },
                                        { value: "row_index", label: locale === "en" ? "row index" : "index de ligne" },
                                        { value: "temporal", label: locale === "en" ? "temporal" : "temporel" },
                                    ], icons: icons }) }), _jsx(Field, { label: locale === "en" ? "Missing values" : "Valeurs manquantes", compact: true, children: _jsx(Select, { value: advanced.missingPolicy, onChange: (v) => onUpdateAdvanced({ missingPolicy: v }), options: [
                                        { value: "forbid", label: locale === "en" ? "forbid" : "interdire" },
                                        { value: "allow", label: locale === "en" ? "allow" : "autoriser" },
                                        { value: "impute", label: locale === "en" ? "impute" : "imputer" },
                                        { value: "drop_rows", label: locale === "en" ? "drop rows" : "exclure les lignes" },
                                    ], icons: icons }) }), _jsx(Field, { label: locale === "en" ? "Y typing" : "Typage Y", compact: true, children: _jsx(Select, { value: advanced.yTask, onChange: (v) => onUpdateAdvanced({ yTask: v }), options: [
                                        { value: "auto", label: "auto" },
                                        { value: "regression", label: locale === "en" ? "regression" : "régression" },
                                        { value: "classification", label: "classification" },
                                        { value: "multilabel", label: "multilabel" },
                                        { value: "multiclass", label: "multiclass" },
                                        { value: "ordinal", label: "ordinal" },
                                    ], icons: icons }) })] })] }), _jsx(LiveValidationCard, { validation: validation, locale: locale, icons: icons })] }));
}
function Field({ label, children, role, compact, }) {
    return (_jsxs("label", { className: "dsb-field", "data-role": role ? ROLE_DESCRIPTORS[role].token : undefined, "data-compact": compact || undefined, children: [_jsx("span", { className: "dsb-field__label", children: label }), children] }));
}
function RoleSummaryField({ label, role, columns, onPreview, locale, icons, }) {
    const summary = columns.length === 0
        ? locale === "en"
            ? "— none —"
            : "— aucune —"
        : columns.length > 3
            ? `${columns[0]?.name} → ${columns[columns.length - 1]?.name}`
            : columns.map((c) => c.name).join(", ");
    return (_jsxs("div", { className: "dsb-field dsb-field--summary", "data-role": ROLE_DESCRIPTORS[role].token, children: [_jsx("span", { className: "dsb-field__label", children: label }), _jsxs("div", { className: "dsb-field__summary-box", "data-role": ROLE_DESCRIPTORS[role].token, children: [_jsx("span", { className: "dsb-field__summary-text", children: summary }), columns.length > 0 && onPreview ? (_jsxs("button", { type: "button", className: "dsb-field__preview", onClick: () => onPreview(role), children: [icon("eye", icons), " ", columns.length] })) : null] })] }));
}
function Select({ value, onChange, options, icons, }) {
    return (_jsxs("div", { className: "dsb-select", children: [_jsx("select", { value: value, onChange: (e) => onChange(e.target.value), children: options.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) }), _jsx("span", { className: "dsb-select__chevron", "aria-hidden": "true", children: icon("chevron", icons) })] }));
}
function Switch({ label, checked, onChange, }) {
    return (_jsxs("label", { className: "dsb-switch", children: [_jsx("input", { type: "checkbox", checked: checked, onChange: (e) => onChange(e.target.checked) }), _jsx("span", { className: "dsb-switch__track", "aria-hidden": "true", children: _jsx("span", { className: "dsb-switch__thumb" }) }), _jsx("span", { className: "dsb-switch__label", children: label })] }));
}
//# sourceMappingURL=DatasetSourceConfigPanel.js.map