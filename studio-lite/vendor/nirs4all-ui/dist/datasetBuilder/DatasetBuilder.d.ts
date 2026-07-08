import { type ReactNode } from "react";
import { type BuilderIconKey } from "./icons.js";
import { type Locale } from "./roles.js";
import { type DatasetExportConfig, type DatasetSource } from "./types.js";
export interface DatasetBuilderProps {
    /** Controlled sources. Omit to let the component own them internally. */
    sources?: DatasetSource[];
    /** Initial sources when uncontrolled. */
    defaultSources?: DatasetSource[];
    onChange?: (sources: DatasetSource[]) => void;
    /** Run auto-detection when a source first has no manual roles (default true). */
    autoDetectOnLoad?: boolean;
    datasetName?: string;
    defaultDatasetName?: string;
    onDatasetNameChange?: (name: string) => void;
    /** Host opens a file/folder picker and pushes parsed `DatasetSource`s back. */
    onRequestAddSource?: () => void;
    onExport?: (config: DatasetExportConfig, sources: DatasetSource[]) => void;
    locale?: Locale;
    icons?: Partial<Record<BuilderIconKey, ReactNode>> | undefined;
    className?: string;
    /** Render the right configuration rail (default true). */
    showConfigPanel?: boolean;
}
/**
 * The full multimodal Dataset Builder wizard. Presentational + self-contained:
 * it owns local UI state (active step/source, filters, toggles) but never reads
 * files, hits the network, or runs a runtime — the host parses files into
 * `DatasetSource` descriptors and receives the exported config.
 */
export declare function DatasetBuilder({ sources: controlledSources, defaultSources, onChange, autoDetectOnLoad, datasetName, defaultDatasetName, onDatasetNameChange, onRequestAddSource, onExport, locale, icons, className, showConfigPanel, }: DatasetBuilderProps): import("react").JSX.Element;
//# sourceMappingURL=DatasetBuilder.d.ts.map