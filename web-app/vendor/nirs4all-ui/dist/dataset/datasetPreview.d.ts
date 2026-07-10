/**
 * Pure dataset preview view-model helpers.
 *
 * Hosts keep ownership of dataset loading and schema adapters; this module only
 * turns small, package-level display contracts into reusable labels, stats, and
 * badges for Studio/Web dataset cards.
 */
export type DatasetPreviewTaskKind = "regression" | "classification" | "mixed" | "unknown";
export type DatasetPreviewTone = "default" | "muted" | "warning";
export type DatasetPreviewCount = number | string | null | undefined;
export interface DatasetSplitCountInput {
    id?: string | null;
    key?: string | null;
    label?: string | null;
    count?: DatasetPreviewCount;
}
export type DatasetSplitCountsInput = readonly DatasetSplitCountInput[] | Record<string, DatasetPreviewCount>;
export interface DatasetSpectralRangeInput {
    start?: DatasetPreviewCount;
    end?: DatasetPreviewCount;
    min?: DatasetPreviewCount;
    max?: DatasetPreviewCount;
    unit?: string | null;
}
export interface DatasetPreviewInput {
    id?: string | null;
    name?: string | null;
    title?: string | null;
    description?: string | null;
    taskType?: string | null;
    sampleCount?: DatasetPreviewCount;
    spectrumCount?: DatasetPreviewCount;
    rowCount?: DatasetPreviewCount;
    featureCount?: DatasetPreviewCount;
    wavelengthCount?: DatasetPreviewCount;
    targetCount?: DatasetPreviewCount;
    classCount?: DatasetPreviewCount;
    splitCounts?: DatasetSplitCountsInput | null;
    splits?: DatasetSplitCountsInput | null;
    spectralRange?: DatasetSpectralRangeInput | readonly [DatasetPreviewCount, DatasetPreviewCount] | null;
    tags?: readonly (string | null | undefined)[] | null;
}
export interface DatasetSplitCountView {
    id: string;
    label: string;
    count: number;
    countLabel: string;
    percentage: number | null;
    percentageLabel: string | null;
}
export interface DatasetPreviewBadge {
    id: string;
    label: string;
    tone: DatasetPreviewTone;
}
export interface DatasetPreviewStat {
    id: "samples" | "features" | "targets" | "classes" | "splits" | "range";
    label: string;
    value: string;
    detail: string | null;
    tone: DatasetPreviewTone;
}
export interface DatasetPreviewView {
    id: string | null;
    title: string;
    description: string | null;
    taskKind: DatasetPreviewTaskKind;
    taskLabel: string;
    sampleCount: number | null;
    sampleCountLabel: string | null;
    featureCount: number | null;
    featureCountLabel: string | null;
    targetCount: number | null;
    targetCountLabel: string | null;
    classCount: number | null;
    classCountLabel: string | null;
    spectralRangeLabel: string | null;
    splitCounts: DatasetSplitCountView[];
    splitSummaryLabel: string | null;
    tags: string[];
    badges: DatasetPreviewBadge[];
    stats: DatasetPreviewStat[];
}
export declare function parseDatasetCount(value: DatasetPreviewCount): number | null;
export declare function formatDatasetCount(value: DatasetPreviewCount, singular: string, plural?: string): string | null;
export declare function resolveDatasetTaskKind(taskType: string | null | undefined): DatasetPreviewTaskKind;
export declare function formatDatasetTaskLabel(taskType: string | null | undefined): string;
export declare function formatDatasetTokenLabel(value: string | null | undefined): string;
export declare function normalizeDatasetSplitCounts(input: DatasetSplitCountsInput | null | undefined, sampleCount?: DatasetPreviewCount): DatasetSplitCountView[];
export declare function formatDatasetSpectralRange(range: DatasetPreviewInput["spectralRange"]): string | null;
export declare function buildDatasetPreview(input: DatasetPreviewInput | null | undefined): DatasetPreviewView | null;
//# sourceMappingURL=datasetPreview.d.ts.map