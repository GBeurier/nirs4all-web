import type { ReactNode } from "react";
export interface ScoreCardMetric {
    label: string;
    value: string;
    tone?: "positive" | "negative" | "neutral";
}
export interface ScoreCardNode {
    id: string;
    label: string;
    kind?: string;
    metrics?: readonly ScoreCardMetric[];
    children?: readonly ScoreCardNode[];
}
export interface ScoreCardTreeProps {
    nodes: readonly ScoreCardNode[];
    defaultOpen?: boolean;
    renderMetric?: (metric: ScoreCardMetric) => ReactNode;
    className?: string;
    nodeClassName?: string;
    summaryClassName?: string;
    labelClassName?: string;
    kindClassName?: string;
    metricsClassName?: string;
    metricClassName?: string;
    metricLabelClassName?: string;
    metricValueClassName?: string;
    childrenClassName?: string;
    empty?: ReactNode;
}
export declare function ScoreCardTree({ nodes, defaultOpen, renderMetric, className, nodeClassName, summaryClassName, labelClassName, kindClassName, metricsClassName, metricClassName, metricLabelClassName, metricValueClassName, childrenClassName, empty, }: ScoreCardTreeProps): import("react").JSX.Element | null;
//# sourceMappingURL=ScoreCardTree.d.ts.map