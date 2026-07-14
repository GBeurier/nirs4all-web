import type { ReactNode } from "react";
export interface RankingRow {
    rank: number;
    name: string;
    score: string;
    detail?: string;
    highlight?: boolean;
}
export interface RankingsTableProps {
    rows: readonly RankingRow[];
    metricLabel?: string;
    headers?: {
        rank?: string;
        name?: string;
        detail?: string;
    };
    className?: string;
    theadClassName?: string;
    rowClassName?: string;
    highlightRowClassName?: string;
    cellClassName?: string;
    rankClassName?: string;
    nameClassName?: string;
    scoreClassName?: string;
    empty?: ReactNode;
}
export declare function RankingsTable({ rows, metricLabel, headers, className, theadClassName, rowClassName, highlightRowClassName, cellClassName, rankClassName, nameClassName, scoreClassName, empty, }: RankingsTableProps): import("react").JSX.Element | null;
//# sourceMappingURL=RankingsTable.d.ts.map