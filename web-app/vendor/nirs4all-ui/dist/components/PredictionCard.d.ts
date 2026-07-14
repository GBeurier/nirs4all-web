import type { ReactNode } from "react";
export interface PredictionCardProps {
    sampleId: string;
    predicted: number | string;
    unit?: string;
    interval?: string;
    targetLabel?: string;
    meta?: readonly {
        label: string;
        value: string;
    }[];
    formatValue?: (value: number | string) => ReactNode;
    children?: ReactNode;
    className?: string;
    headerClassName?: string;
    sampleIdClassName?: string;
    targetClassName?: string;
    valueClassName?: string;
    unitClassName?: string;
    intervalClassName?: string;
    metaListClassName?: string;
    metaRowClassName?: string;
    metaLabelClassName?: string;
    metaValueClassName?: string;
}
export declare function PredictionCard({ sampleId, predicted, unit, interval, targetLabel, meta, formatValue, children, className, headerClassName, sampleIdClassName, targetClassName, valueClassName, unitClassName, intervalClassName, metaListClassName, metaRowClassName, metaLabelClassName, metaValueClassName, }: PredictionCardProps): import("react").JSX.Element;
//# sourceMappingURL=PredictionCard.d.ts.map