/**
 * Small inline SVG icon set so the wizard renders complete out of the box.
 * Hosts can override any icon through the `icons` prop on `DatasetBuilder`.
 */
import type { ReactNode } from "react";
import type { DatasetRole, SignalType } from "./types.js";
export type BuilderIconKey = DatasetRole | "check" | "warning" | "error" | "chevron" | "file" | "folder" | "upload" | "info" | "eye" | "arrow" | "spark" | SignalType;
export declare const DEFAULT_ICONS: Partial<Record<BuilderIconKey, ReactNode>>;
export declare function icon(key: BuilderIconKey, overrides?: Partial<Record<string, ReactNode>>): ReactNode;
//# sourceMappingURL=icons.d.ts.map