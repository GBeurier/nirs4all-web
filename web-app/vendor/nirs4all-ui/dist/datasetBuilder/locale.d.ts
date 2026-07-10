/**
 * UI chrome strings for the wizard (FR default, EN parallel). Kept separate from
 * role/validation copy so hosts can override the whole label set at once.
 */
import type { Locale } from "./roles.js";
import type { WizardStep } from "./types.js";
export interface BuilderStrings {
    title: string;
    stepSubtitles: Record<WizardStep, string>;
    steps: Record<WizardStep, string>;
    assistantTitle: string;
    assistantSubtitle: string;
    signalType: string;
    fileFormat: string;
    separator: string;
    decimal: string;
    headers: string;
    headersHorizontal: string;
    headersVertical: string;
    columnChoice: string;
    useAs: string;
    autoDetect: string;
    manualColumns: string;
    advanced: string;
    liveValidation: string;
    rolePrompt: string;
    columnHeaderCheckbox: string;
    columnHeaderName: string;
    columnHeaderPreview: string;
    columnHeaderType: string;
    columnHeaderRole: string;
    filterAll: string;
    hideAssigned: string;
    selectSpectra: string;
    columnsDetected: (n: number) => string;
    columnsAssigned: (n: number) => string;
    tip: string;
    tipBody: string;
    partitionTitle: string;
    partitionModes: Record<string, string>;
    addSource: string;
    noSourceHint: string;
    continueLabel: (next: string) => string;
    createDataset: string;
    exportJson: string;
    applyToSelected: (n: number) => string;
    applyToFile: string;
    rows: string;
    columns: string;
    loaded: string;
}
export declare const STRINGS: Record<Locale, BuilderStrings>;
//# sourceMappingURL=locale.d.ts.map