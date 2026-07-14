import type { ReactNode } from "react";
export interface PerClassRow {
    label: string;
    precision: number;
    recall: number;
    f1: number;
    support: number;
}
export interface PerClassTableProps {
    rows: readonly PerClassRow[];
    headers?: {
        class?: string;
        precision?: string;
        recall?: string;
        f1?: string;
        support?: string;
    };
    valueFormat?: (value: number) => string;
    className?: string;
    theadClassName?: string;
    rowClassName?: string;
    cellClassName?: string;
    labelCellClassName?: string;
    empty?: ReactNode;
}
export declare function PerClassTable({ rows, headers, valueFormat, className, theadClassName, rowClassName, cellClassName, labelCellClassName, empty, }: PerClassTableProps): import("react").JSX.Element | null;
//# sourceMappingURL=PerClassTable.d.ts.map