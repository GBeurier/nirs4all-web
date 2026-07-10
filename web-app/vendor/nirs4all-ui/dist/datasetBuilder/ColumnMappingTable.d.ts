import type { ReactNode } from "react";
import { type BuilderIconKey } from "./icons.js";
import { type Locale } from "./roles.js";
import type { DatasetColumn, DatasetRole } from "./types.js";
export type ColumnFilter = DatasetRole | "all" | "unassigned";
export interface ColumnMappingTableProps {
    columns: DatasetColumn[];
    onToggleColumn: (columnId: string, selected?: boolean) => void;
    onToggleAll?: (selected: boolean) => void;
    onAssignColumnRole: (columnId: string, role: DatasetRole) => void;
    onSelectSpectra?: () => void;
    filter?: ColumnFilter;
    onFilterChange?: (filter: ColumnFilter) => void;
    hideAssigned?: boolean;
    onToggleHideAssigned?: (hide: boolean) => void;
    locale?: Locale;
    icons?: Partial<Record<BuilderIconKey, ReactNode>> | undefined;
    /** show the compact side tip/progress panel (default true). */
    showTip?: boolean;
    className?: string;
}
export declare function ColumnMappingTable({ columns, onToggleColumn, onToggleAll, onAssignColumnRole, onSelectSpectra, filter, onFilterChange, hideAssigned, onToggleHideAssigned, locale, icons, showTip, className, }: ColumnMappingTableProps): import("react").JSX.Element;
//# sourceMappingURL=ColumnMappingTable.d.ts.map