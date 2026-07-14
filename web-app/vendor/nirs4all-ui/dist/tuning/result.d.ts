export type TuningEngine = "optuna" | "n4m";
export type TuningDirection = "minimize" | "maximize";
export type TuningTrialStatus = "complete" | "failed" | "running" | "pruned" | "waiting" | "unknown";
export type TuningTrialTone = "success" | "error" | "warning" | "info" | "muted";
export declare const TUNING_SUMMARY_FORMAT: "nirs4all.tuning.summary";
export declare const TUNING_SUMMARY_SCHEMA_VERSION: 1;
export interface DagMLTuningSpec {
    direction: TuningDirection;
    engine: TuningEngine;
    metric: string;
    n_trials: number;
    pruner: string | null;
    resume: boolean;
    sampler: string | null;
    seed: number | null;
    space: Record<string, unknown>;
    storage: string | null;
    study_name: string | null;
}
export interface TuningTrialResult {
    diagnostics: Record<string, unknown>;
    number: number;
    params: Record<string, unknown>;
    state: string;
    value: number | null;
}
export interface TuningSummaryTrial {
    diagnostics?: Record<string, unknown>;
    number: number;
    state: string;
    value: number | null;
}
export interface TuningSummaryPersistence {
    optimizer_state_resume_supported: boolean;
    resume: boolean;
    storage_configured: boolean;
    study_name: string | null;
}
export interface TuningResultArtifact {
    best_params: Record<string, unknown>;
    best_value: number;
    fingerprint?: string;
    optimizer: string;
    trials: TuningTrialResult[];
    tuning: DagMLTuningSpec;
}
export interface TuningSummaryArtifact {
    best_params: Record<string, unknown>;
    best_value: number;
    direction: TuningDirection;
    engine: TuningEngine;
    fingerprint: string;
    format: typeof TUNING_SUMMARY_FORMAT;
    metric: string;
    n_trials: number;
    optimizer: string;
    persistence?: TuningSummaryPersistence;
    pruner?: string | null;
    sampler?: string | null;
    schema_version: typeof TUNING_SUMMARY_SCHEMA_VERSION;
    seed?: number | null;
    trial_states: Record<string, number>;
    trials: TuningSummaryTrial[];
    version: 1;
}
export interface TuningStudySummary {
    bestParams: Record<string, unknown>;
    bestValue: number;
    bestValueLabel: string;
    completeTrials: number;
    direction: TuningDirection;
    failedTrials: number;
    fingerprint: string | null;
    metric: string;
    nTrials: number;
    optimizer: string;
    pruner: string | null;
    prunedTrials: number;
    runningTrials: number;
    sampler: string | null;
    searchSpaceSize: number;
    seed: number | null;
    studyName: string | null;
}
export interface TuningSummaryCard {
    bestParams: Record<string, unknown>;
    bestValue: number;
    bestValueLabel: string;
    completeTrials: number;
    direction: TuningDirection;
    engine: TuningEngine;
    failedTrials: number;
    fingerprint: string;
    metric: string;
    nTrials: number;
    optimizer: string;
    optimizerStateResumeSupported: boolean | null;
    persistence: TuningSummaryPersistence | null;
    pruner: string | null;
    prunedTrials: number;
    resume: boolean | null;
    runningTrials: number;
    sampler: string | null;
    seed: number | null;
    storageConfigured: boolean | null;
    studyName: string | null;
    unknownTrials: number;
}
export interface TuningTrialRow {
    diagnostics: Record<string, unknown>;
    isBest: boolean;
    number: number;
    params: Record<string, unknown>;
    paramsLabel: string;
    status: TuningTrialStatus;
    statusLabel: string;
    tone: TuningTrialTone;
    value: number | null;
    valueLabel: string;
}
export interface TuningSummaryTrialRow {
    diagnostics: Record<string, unknown>;
    number: number;
    status: TuningTrialStatus;
    statusLabel: string;
    tone: TuningTrialTone;
    value: number | null;
    valueLabel: string;
}
export declare function isDagMLTuningSpec(value: unknown): value is DagMLTuningSpec;
export declare function isTuningTrialResult(value: unknown): value is TuningTrialResult;
export declare function isTuningSummaryTrial(value: unknown): value is TuningSummaryTrial;
export declare function isTuningSummaryPersistence(value: unknown): value is TuningSummaryPersistence;
export declare function isTuningResultArtifact(value: unknown): value is TuningResultArtifact;
export declare function isTuningSummaryArtifact(value: unknown): value is TuningSummaryArtifact;
export declare function parseTuningResultArtifact(value: unknown): TuningResultArtifact;
export declare function parseTuningSummaryArtifact(value: unknown): TuningSummaryArtifact;
export declare function normalizeTuningTrialStatus(state: string | null | undefined): TuningTrialStatus;
export declare function getTuningTrialTone(status: TuningTrialStatus): TuningTrialTone;
export declare function createTuningStudySummary(artifact: TuningResultArtifact): TuningStudySummary;
export declare function createTuningSummaryCard(artifact: TuningSummaryArtifact): TuningSummaryCard;
export declare function createTuningTrialRows(artifact: TuningResultArtifact): TuningTrialRow[];
export declare function createTuningSummaryTrialRows(artifact: TuningSummaryArtifact): TuningSummaryTrialRow[];
//# sourceMappingURL=result.d.ts.map