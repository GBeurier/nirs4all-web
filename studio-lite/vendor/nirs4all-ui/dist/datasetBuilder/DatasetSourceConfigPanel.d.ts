import { type ReactNode } from "react";
import { type BuilderIconKey } from "./icons.js";
import { type Locale } from "./roles.js";
import type { AdvancedOptions, DatasetRole, DatasetSource, SignalType, SourceParsing, SourceUseAs, ValidationResult } from "./types.js";
export interface DatasetSourceConfigPanelProps {
    source: DatasetSource;
    validation: ValidationResult;
    advanced: AdvancedOptions;
    autoDetect: boolean;
    manualColumns: boolean;
    onUpdateParsing: (parsing: Partial<SourceParsing>) => void;
    onUpdateSignalType: (signalType: SignalType) => void;
    onUpdateUseAs: (useAs: SourceUseAs) => void;
    onAssignColumnRole: (columnId: string, role: DatasetRole) => void;
    onSetSingletonRole: (role: DatasetRole, columnId: string | "") => void;
    onToggleAutoDetect: (enabled: boolean) => void;
    onToggleManualColumns: (enabled: boolean) => void;
    onUpdateAdvanced: (advanced: Partial<AdvancedOptions>) => void;
    onPreviewColumns?: (role: DatasetRole) => void;
    locale?: Locale;
    icons?: Partial<Record<BuilderIconKey, ReactNode>> | undefined;
    className?: string;
}
/** Right-hand guided configuration for the active source. */
export declare function DatasetSourceConfigPanel(props: DatasetSourceConfigPanelProps): import("react").JSX.Element;
//# sourceMappingURL=DatasetSourceConfigPanel.d.ts.map