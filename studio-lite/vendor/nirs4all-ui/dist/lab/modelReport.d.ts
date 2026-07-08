import { type Locale, type LocalizedText } from './locale.js';
/** What the model is fit to be used for, by its accuracy. */
export type ModelGrade = 'quantification' | 'screening' | 'insufficient';
export interface ModelGradeDisplay {
    grade: ModelGrade;
    label: LocalizedText;
    /** plain-language verdict (bilingual) */
    verdict: LocalizedText;
    colorClass: string;
    bgClass: string;
}
export declare const MODEL_GRADE_DISPLAY: Record<ModelGrade, ModelGradeDisplay>;
export interface ModelMetricsInput {
    rmse?: number | null;
    r2?: number | null;
    rpd?: number | null;
    rpiq?: number | null;
    bias?: number | null;
    /** number of samples the metrics were computed on */
    n?: number | null;
}
/**
 * Grade thresholds. Defaults are the widely-used RPD/RPIQ chemometric bands, but
 * a validated method overrides them.
 */
export interface ModelReportThresholds {
    rpdScreening?: number;
    rpdQuantification?: number;
    rpiqScreening?: number;
    rpiqQuantification?: number;
    /** which metric leads the grade when BOTH are present (default 'rpd') */
    primaryMetric?: 'rpd' | 'rpiq';
    /**
     * How to combine RPD & RPIQ when both are present:
     * - 'primary'      → use `primaryMetric` (the other is informational)
     * - 'conservative' → take the WORSE of the two grades (safer for release)
     */
    gradingMode?: 'primary' | 'conservative';
}
export declare const DEFAULT_MODEL_REPORT_THRESHOLDS: Required<ModelReportThresholds>;
export type MetricInterpretationTone = 'good' | 'fair' | 'poor' | 'neutral';
export interface MetricInterpretation {
    key: 'rmse' | 'r2' | 'rpd' | 'rpiq' | 'bias';
    label: string;
    value: number | null;
    /** formatted value string */
    display: string;
    /** plain-language reading, e.g. "RPD 2.4 = bon pour du criblage" */
    reading: string;
    tone: MetricInterpretationTone;
}
export interface ModelReportView {
    grade: ModelGrade;
    gradeLabel: string;
    verdict: string;
    colorClass: string;
    bgClass: string;
    metrics: MetricInterpretation[];
}
/**
 * Grade the model from RPD/RPIQ with an EXPLICIT conflict policy (no silent
 * "RPD wins"): `gradingMode` decides how the two combine when both are present.
 */
export declare function gradeModel(metrics: ModelMetricsInput, thresholds?: ModelReportThresholds | null): ModelGrade;
export declare function buildModelReportView(metrics: ModelMetricsInput, thresholds?: ModelReportThresholds | null, locale?: Locale): ModelReportView;
//# sourceMappingURL=modelReport.d.ts.map