import type { ReactNode } from 'react';
import { type MetricInterpretation, type ModelMetricsInput, type ModelReportThresholds, type ModelReportView } from './modelReport.js';
import type { Locale } from './locale.js';
export interface ModelReportCardProps {
    metrics?: ModelMetricsInput;
    thresholds?: ModelReportThresholds | null;
    /** precomputed view (takes precedence) */
    view?: ModelReportView | null;
    /** language for generated text (default 'fr') */
    locale?: Locale;
    title?: ReactNode;
    /** render a metric row (else the default label + value + reading) */
    renderMetric?: (metric: MetricInterpretation) => ReactNode;
    /** per-metric tone → className (host maps good/fair/poor/neutral) */
    metricToneClassName?: Partial<Record<MetricInterpretation['tone'], string>>;
    /** apply the grade colour/tint tokens by default (default true) */
    applyTone?: boolean;
    className?: string;
    toneClassName?: string;
    headerClassName?: string;
    verdictClassName?: string;
    gradeLabelClassName?: string;
    metricsClassName?: string;
    metricRowClassName?: string;
    metricLabelClassName?: string;
    metricValueClassName?: string;
    metricReadingClassName?: string;
    empty?: ReactNode;
}
/** The model "bulletin" (§3 Écran 4). Presentational; grade from the view-model. */
export declare function ModelReportCard({ metrics, thresholds, view, locale, title, renderMetric, metricToneClassName, applyTone, className, toneClassName, headerClassName, verdictClassName, gradeLabelClassName, metricsClassName, metricRowClassName, metricLabelClassName, metricValueClassName, metricReadingClassName, empty, }: ModelReportCardProps): import("react").JSX.Element | null;
//# sourceMappingURL=ModelReportCard.d.ts.map