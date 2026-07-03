export type RuntimeDiagnosticTone = "error" | "warning" | "info";
export interface RuntimeDiagnosticItem {
    id: string;
    verb: string | null;
    cause: string | null;
    message: string;
    mitigation: string | null;
    tone: RuntimeDiagnosticTone;
}
export type RuntimeEngineTone = "default" | "success" | "warning" | "muted";
export interface RuntimeEngineStatusView {
    engine: string | null;
    engineLabel: string | null;
    requestedEngine: string | null;
    requestedEngineLabel: string | null;
    badgeLabel: string;
    detailLabel: string | null;
    isFallback: boolean;
    tone: RuntimeEngineTone;
    diagnostics: RuntimeDiagnosticItem[];
}
export interface RuntimeNativeResultsAffordanceInput {
    hasNativeResults?: boolean | null;
    artifactCount?: number | null;
    nativeArtifactCount?: number | null;
    hasRefit?: boolean | null;
    exportLabel?: string | null;
    exportDescription?: string | null;
    disabled?: boolean;
    disabledReason?: string | null;
}
export interface RuntimeNativeResultsAffordanceView {
    hasNativeResults: boolean;
    artifactCount: number | null;
    nativeResultsLabel: string;
    exportLabel: string;
    exportDescription: string | null;
    disabled: boolean;
    disabledReason: string | null;
}
export declare function normalizeRuntimeDiagnostics(source: unknown): RuntimeDiagnosticItem[];
export declare function formatRuntimeTokenLabel(value: string | null | undefined): string;
export declare function buildRuntimeEngineStatus(source: unknown): RuntimeEngineStatusView | null;
export declare function buildRuntimeNativeResultsAffordance(input?: RuntimeNativeResultsAffordanceInput): RuntimeNativeResultsAffordanceView;
//# sourceMappingURL=resultMetadata.d.ts.map