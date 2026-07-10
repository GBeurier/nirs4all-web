export interface MetricValueBadgeProps {
    metric?: string | null;
    value?: number | string | null;
    compareTo?: number | string | null;
    label?: string | null;
    className?: string;
    metricClassName?: string;
    valueClassName?: string;
    directionClassName?: string;
    betterClassName?: string;
    worseClassName?: string;
    equalClassName?: string;
    title?: string;
    showDirection?: boolean;
}
export declare function MetricValueBadge({ metric, value, compareTo, label, className, metricClassName, valueClassName, directionClassName, betterClassName, worseClassName, equalClassName, title, showDirection, }: MetricValueBadgeProps): import("react").JSX.Element;
//# sourceMappingURL=MetricValueBadge.d.ts.map