import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from "react";
import { cx } from "./_cx.js";
import { ColumnMappingTable } from "./ColumnMappingTable.js";
import { DatasetSourceConfigPanel } from "./DatasetSourceConfigPanel.js";
import { DatasetWizardStepper } from "./DatasetWizardStepper.js";
import { LiveValidationCard } from "./LiveValidationCard.js";
import { PartitionPreview } from "./PartitionPreview.js";
import { RoleSelectionCards } from "./RoleSelectionCards.js";
import { SourceSummaryCard } from "./SourceSummaryCard.js";
import { autoDetectSource, isSpectralHeader } from "./detect.js";
import { buildExportConfig } from "./exportConfig.js";
import { icon } from "./icons.js";
import { STRINGS } from "./locale.js";
import { deriveSchema, derivePartitionPreview, assignRoleToColumns, toggleColumnSelection } from "./schema.js";
import { validateBuilder } from "./validate.js";
import {} from "./roles.js";
import { DEFAULT_ADVANCED_OPTIONS, } from "./types.js";
const STEP_ORDER = ["source", "role", "columns", "validation"];
/**
 * The full multimodal Dataset Builder wizard. Presentational + self-contained:
 * it owns local UI state (active step/source, filters, toggles) but never reads
 * files, hits the network, or runs a runtime — the host parses files into
 * `DatasetSource` descriptors and receives the exported config.
 */
export function DatasetBuilder({ sources: controlledSources, defaultSources = [], onChange, autoDetectOnLoad = true, datasetName, defaultDatasetName = "nouveau_dataset", onDatasetNameChange, onRequestAddSource, onExport, locale = "fr", icons, className, showConfigPanel = true, }) {
    const t = STRINGS[locale];
    const [internalSources, setInternalSources] = useState(() => autoDetectOnLoad ? defaultSources.map(maybeDetect) : defaultSources);
    const isControlled = controlledSources !== undefined;
    const sources = isControlled ? controlledSources : internalSources;
    const [internalName, setInternalName] = useState(defaultDatasetName);
    const name = datasetName ?? internalName;
    const [activeStep, setActiveStep] = useState("source");
    const [activeSourceId, setActiveSourceId] = useState(defaultSources[0]?.id);
    const [activeRole, setActiveRole] = useState(null);
    const [filter, setFilter] = useState("all");
    const [hideAssigned, setHideAssigned] = useState(false);
    const [autoDetect, setAutoDetect] = useState(true);
    const [manualColumns, setManualColumns] = useState(true);
    const [partitionMode, setPartitionMode] = useState("train_test");
    const [advanced, setAdvanced] = useState(DEFAULT_ADVANCED_OPTIONS);
    const activeSource = sources.find((s) => s.id === activeSourceId) ?? sources[0];
    const commitSources = useCallback((next) => {
        if (!isControlled)
            setInternalSources(next);
        onChange?.(next);
    }, [isControlled, onChange]);
    const updateActiveSource = useCallback((updater) => {
        if (!activeSource)
            return;
        commitSources(sources.map((s) => (s.id === activeSource.id ? updater(s) : s)));
    }, [activeSource, sources, commitSources]);
    const schema = useMemo(() => deriveSchema(sources), [sources]);
    const validation = useMemo(() => validateBuilder(sources, locale), [sources, locale]);
    const partition = useMemo(() => derivePartitionPreview(sources, partitionMode), [sources, partitionMode]);
    const selectedCount = activeSource?.columns.filter((c) => c.selected).length ?? 0;
    // --- column / role handlers -------------------------------------------------
    const handleAssignColumnRole = useCallback((columnId, role) => {
        updateActiveSource((s) => assignRoleToColumns(s, new Set([columnId]), role));
    }, [updateActiveSource]);
    const handleAssignRoleToSelection = useCallback((role) => {
        setActiveRole(role);
        updateActiveSource((s) => {
            const selectedIds = new Set(s.columns.filter((c) => c.selected).map((c) => c.id));
            if (selectedIds.size === 0)
                return s; // nothing selected → role just becomes active
            const next = assignRoleToColumns(s, selectedIds, role);
            return { ...next, columns: next.columns.map((c) => ({ ...c, selected: false })) };
        });
    }, [updateActiveSource]);
    const handleToggleColumn = useCallback((columnId, selected) => {
        updateActiveSource((s) => toggleColumnSelection(s, columnId, selected));
    }, [updateActiveSource]);
    const handleToggleAll = useCallback((selected) => {
        updateActiveSource((s) => ({ ...s, columns: s.columns.map((c) => ({ ...c, selected })) }));
    }, [updateActiveSource]);
    const handleSelectSpectra = useCallback(() => {
        updateActiveSource((s) => ({
            ...s,
            columns: s.columns.map((c) => ({
                ...c,
                selected: isSpectralHeader(c.name) || c.assignedRole === "x" || Boolean(c.selected),
            })),
        }));
    }, [updateActiveSource]);
    const handleSetSingletonRole = useCallback((role, columnId) => {
        updateActiveSource((s) => {
            const cleared = s.columns.map((c) => c.assignedRole === role ? { ...c, assignedRole: "ignored", manual: true } : c);
            const columns = cleared.map((c) => c.id === columnId ? { ...c, assignedRole: role, manual: true } : c);
            return { ...s, columns };
        });
    }, [updateActiveSource]);
    const handleUpdateParsing = useCallback((parsing) => {
        updateActiveSource((s) => ({ ...s, parsing: { ...s.parsing, ...parsing } }));
    }, [updateActiveSource]);
    const handleUpdateSignalType = useCallback((signalType) => updateActiveSource((s) => ({ ...s, signalType })), [updateActiveSource]);
    const handleUpdateUseAs = useCallback((useAs) => updateActiveSource((s) => ({ ...s, usage: { ...s.usage, useAs } })), [updateActiveSource]);
    const handleToggleAutoDetect = useCallback((enabled) => {
        setAutoDetect(enabled);
        if (enabled)
            updateActiveSource((s) => autoDetectSource({ ...s, columns: s.columns.map((c) => ({ ...c, manual: false })) }));
    }, [updateActiveSource]);
    const handleNameChange = useCallback((value) => {
        if (datasetName === undefined)
            setInternalName(value);
        onDatasetNameChange?.(value);
    }, [datasetName, onDatasetNameChange]);
    const handleExport = useCallback(() => {
        onExport?.(buildExportConfig(name, sources), sources);
    }, [onExport, name, sources]);
    const goToStep = useCallback((step) => setActiveStep(step), []);
    const activeIndex = STEP_ORDER.indexOf(activeStep);
    const nextStep = STEP_ORDER[activeIndex + 1];
    const hasSources = sources.length > 0;
    return (_jsxs("div", { className: cx("dsb", className), "data-locale": locale, children: [_jsx(TopBar, { name: name, onNameChange: handleNameChange, schema: schema, sourceCount: sources.length, sampleCount: partition.total, validationStatus: validation.status, onCreate: handleExport, locale: locale, icons: icons }), _jsxs("div", { className: "dsb__body", children: [_jsxs("main", { className: "dsb__main", children: [_jsxs("header", { className: "dsb__header", children: [_jsx("h2", { className: "dsb__title", children: t.title }), _jsx(DatasetWizardStepper, { activeStep: activeStep, onStepClick: goToStep, locale: locale, icons: icons }), _jsxs("p", { className: "dsb__subtitle", children: [_jsx("span", { className: "dsb__subtitle-icon", children: icon("info", icons) }), t.stepSubtitles[activeStep]] })] }), !hasSources ? (_jsx(DropZone, { onClick: onRequestAddSource, locale: locale, icons: icons })) : (_jsxs(_Fragment, { children: [sources.length > 1 ? (_jsxs("div", { className: "dsb__source-tabs", role: "tablist", children: [sources.map((s) => (_jsxs("button", { type: "button", className: "dsb__source-tab", "data-active": s.id === activeSource?.id || undefined, onClick: () => setActiveSourceId(s.id), children: [icon(s.kind === "folder" ? "folder" : "file", icons), " ", s.name] }, s.id))), onRequestAddSource ? (_jsxs("button", { type: "button", className: "dsb__source-tab dsb__source-tab--add", onClick: onRequestAddSource, children: ["+ ", t.addSource] })) : null] })) : null, activeSource ? (_jsx(SourceSummaryCard, { source: activeSource, sources: sources, onChangeSource: setActiveSourceId, locale: locale, icons: icons })) : null, activeStep !== "validation" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "dsb__section", children: [_jsx("h3", { className: "dsb__section-title", children: t.rolePrompt }), _jsx(RoleSelectionCards, { selectedCount: selectedCount, activeRole: activeRole, onAssignRole: handleAssignRoleToSelection, locale: locale, icons: icons })] }), activeSource ? (_jsxs("section", { className: "dsb__section", children: [_jsx("h3", { className: "dsb__section-title", children: locale === "en" ? "Column preview & mapping" : "Aperçu et mapping des colonnes" }), _jsx(ColumnMappingTable, { columns: activeSource.columns, onToggleColumn: handleToggleColumn, onToggleAll: handleToggleAll, onAssignColumnRole: handleAssignColumnRole, onSelectSpectra: handleSelectSpectra, filter: filter, onFilterChange: setFilter, hideAssigned: hideAssigned, onToggleHideAssigned: setHideAssigned, locale: locale, icons: icons })] })) : null] })) : (_jsx(ValidationStep, { config: buildExportConfig(name, sources), validation: validation, locale: locale, icons: icons })), _jsx(PartitionPreview, { preview: partition, onModeChange: setPartitionMode, locale: locale })] })), _jsxs("footer", { className: "dsb__footer", children: [_jsx("div", { className: "dsb__footer-spacer" }), nextStep ? (_jsxs("button", { type: "button", className: "dsb-btn dsb-btn--primary", onClick: () => goToStep(nextStep), disabled: !hasSources, children: [t.continueLabel(t.steps[nextStep]), " ", icon("arrow", icons)] })) : (_jsxs("button", { type: "button", className: "dsb-btn dsb-btn--primary", onClick: handleExport, disabled: validation.status === "error", children: [icon("check", icons), " ", t.createDataset] }))] })] }), showConfigPanel && activeSource ? (_jsx(DatasetSourceConfigPanel, { source: activeSource, validation: validation, advanced: advanced, autoDetect: autoDetect, manualColumns: manualColumns, onUpdateParsing: handleUpdateParsing, onUpdateSignalType: handleUpdateSignalType, onUpdateUseAs: handleUpdateUseAs, onAssignColumnRole: handleAssignColumnRole, onSetSingletonRole: handleSetSingletonRole, onToggleAutoDetect: handleToggleAutoDetect, onToggleManualColumns: setManualColumns, onUpdateAdvanced: (patch) => setAdvanced((prev) => ({ ...prev, ...patch })), locale: locale, icons: icons })) : null] })] }));
}
function maybeDetect(source) {
    const hasManual = source.columns.some((c) => c.manual);
    return hasManual ? source : autoDetectSource(source);
}
function TopBar({ name, onNameChange, schema, sourceCount, sampleCount, validationStatus, onCreate, locale, icons, }) {
    const t = STRINGS[locale];
    const en = locale === "en";
    return (_jsxs("div", { className: "dsb__topbar", children: [_jsxs("div", { className: "dsb__brand", children: [_jsx("span", { className: "dsb__brand-mark", "aria-hidden": "true", children: icon("spark", icons) }), _jsx("span", { className: "dsb__brand-name", children: "nirs4all" }), _jsx("span", { className: "dsb__brand-sub", children: "Dataset Builder" })] }), _jsx("input", { className: "dsb__name-input", value: name, onChange: (e) => onNameChange(e.target.value), "aria-label": en ? "Dataset name" : "Nom du dataset", spellCheck: false }), _jsxs("div", { className: "dsb__chips", children: [_jsxs("span", { className: "dsb__chip", "data-role": "x", children: [icon("x", icons), " ", schema.xSources.length || sourceCount, " ", en ? "modalities" : "modalités"] }), _jsxs("span", { className: "dsb__chip", "data-role": "y", children: [icon("y", icons), " ", schema.yColumns.length, " targets"] }), _jsxs("span", { className: "dsb__chip", "data-role": "id", children: [icon("group", icons), " ", sampleCount.toLocaleString("fr-FR"), " samples"] }), _jsxs("span", { className: "dsb__chip", "data-status": validationStatus, children: [icon(validationStatus === "ok" ? "check" : validationStatus === "warning" ? "warning" : "error", icons), validationStatus === "ok" ? "Train/Test OK" : validationStatus === "warning" ? (en ? "Warnings" : "Avertissements") : (en ? "Incomplete" : "Incomplet")] })] }), _jsxs("button", { type: "button", className: "dsb-btn dsb-btn--primary dsb__create", onClick: onCreate, disabled: validationStatus === "error", children: [icon("check", icons), " ", t.createDataset] })] }));
}
function DropZone({ onClick, locale, icons, }) {
    const t = STRINGS[locale];
    const en = locale === "en";
    return (_jsxs("button", { type: "button", className: "dsb__dropzone", onClick: onClick, children: [_jsx("span", { className: "dsb__dropzone-icon", children: icon("upload", icons) }), _jsx("strong", { children: en ? "Drop your files or folders" : "Glissez-déposez vos fichiers ou dossiers" }), _jsx("span", { className: "dsb__dropzone-hint", children: t.noSourceHint }), _jsxs("span", { className: "dsb__dropzone-types", children: [_jsx("span", { className: "dsb-chip", "data-role": "x", children: "CSV" }), _jsx("span", { className: "dsb-chip", "data-role": "metadata", children: "Excel" }), _jsx("span", { className: "dsb-chip", "data-role": "x", children: "Parquet" }), _jsx("span", { className: "dsb-chip", "data-role": "id", children: "Images" })] })] }));
}
function ValidationStep({ config, validation, locale, icons, }) {
    const en = locale === "en";
    return (_jsxs("div", { className: "dsb__validation-step", children: [_jsx(LiveValidationCard, { validation: validation, locale: locale, icons: icons, title: en ? "Consistency summary" : "Résumé de cohérence" }), _jsxs("section", { className: "dsb__export-preview", children: [_jsxs("header", { className: "dsb__export-head", children: [_jsx("strong", { children: en ? "Generated config" : "Configuration générée" }), _jsx("code", { children: "dataset.json" })] }), _jsx("pre", { className: "dsb__export-json", children: JSON.stringify(config, null, 2) })] })] }));
}
//# sourceMappingURL=DatasetBuilder.js.map