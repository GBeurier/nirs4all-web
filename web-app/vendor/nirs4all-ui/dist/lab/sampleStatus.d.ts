/** The sample lifecycle, in operational order. */
export declare const SAMPLE_STATUSES: readonly ["received", "nirs_measured", "to_remeasure", "sent_hplc", "integrated", "excluded"];
export type SampleStatus = typeof SAMPLE_STATUSES[number];
/** Semantic icon token; the host maps it to an actual ReactNode. */
export type SampleStatusIcon = 'inbox' | 'waveform' | 'refresh' | 'flask' | 'check' | 'x';
export interface SampleStatusDisplay {
    status: SampleStatus;
    label: string;
    /** one-line plain-language description of what this state means operationally */
    description: string;
    colorClass: string;
    bgClass: string;
    icon: SampleStatusIcon;
    /** terminal states no longer move through the workflow */
    isTerminal: boolean;
}
export declare const SAMPLE_STATUS_DISPLAY: Record<SampleStatus, SampleStatusDisplay>;
export declare function isSampleStatus(value: unknown): value is SampleStatus;
export declare function resolveSampleStatus(value: string | null | undefined, fallback?: SampleStatus): SampleStatus;
export declare function getSampleStatusDisplay(value: string | null | undefined): SampleStatusDisplay;
/** Aggregate a batch of sample statuses into per-state counts (for dashboards). */
export declare function countSampleStatuses(statuses: Iterable<string | null | undefined>): Record<SampleStatus, number>;
//# sourceMappingURL=sampleStatus.d.ts.map