export declare const KEYWORD_REGISTRY_SCHEMA_ID: "https://nirs4all.org/schemas/keyword-effects/v1";
export declare const KEYWORD_REGISTRY_SCHEMA_VERSION: 1;
export type KeywordRegistryStatus = "supported" | "partial" | "planned";
export type KeywordRegistryInvalidation = "always" | "if_predictor_changes" | "replaces_existing" | "extends_existing" | "mode_dependent" | "not_applicable";
export interface KeywordRegistryAlias {
    kind: "token" | "value";
    name: string;
    canonical: string;
    mode: "read_only";
}
export interface KeywordRegistryUiHint {
    label: string;
    group: string;
    control: string;
    order: number;
}
export interface KeywordRegistryEntry {
    aliases: readonly KeywordRegistryAlias[];
    canonical_term: string;
    changes: readonly string[];
    docs_anchor: string;
    engine_support: Record<string, string>;
    id: string;
    invalidates_calibration: KeywordRegistryInvalidation;
    lifecycle_stage: string;
    path: string;
    reads: readonly string[];
    scope: string;
    status: KeywordRegistryStatus;
    summary: string;
    surface: string;
    token: string;
    ui: KeywordRegistryUiHint;
    value_schema: Record<string, unknown>;
}
export interface KeywordRegistryDocument {
    entries: readonly KeywordRegistryEntry[];
    registry_version: string;
    schema_id: typeof KEYWORD_REGISTRY_SCHEMA_ID;
    schema_version: typeof KEYWORD_REGISTRY_SCHEMA_VERSION;
    scope: string;
}
export interface KeywordRegistryFieldView {
    control: string;
    docsAnchor: string;
    engineSupport: Record<string, string>;
    group: string;
    id: string;
    invalidatesCalibration: KeywordRegistryInvalidation;
    label: string;
    order: number;
    path: string;
    status: KeywordRegistryStatus;
    summary: string;
    valueSchema: Record<string, unknown>;
}
export interface KeywordRegistryFormSection {
    fields: KeywordRegistryFieldView[];
    group: string;
    label: string;
    order: number;
}
export interface KeywordRegistryValueOption {
    label: string;
    value: unknown;
}
export declare const WORKSPACE_PREDICTION_PUBLICATION_KEYWORD_IDS: readonly ["predict.save_to_workspace", "predict.workspace_metadata", "predict.workspace_result_metadata"];
export type WorkspacePredictionPublicationKeywordId = typeof WORKSPACE_PREDICTION_PUBLICATION_KEYWORD_IDS[number];
export declare const WORKSPACE_PREDICTION_PUBLICATION_EFFECTS: readonly ["workspace_prediction_rows", "prediction_arrays", "result_metadata", "workspace_prediction_id", "prediction_sample_metadata", "robustness_evidence"];
export declare const WORKSPACE_PREDICTION_PUBLICATION_DESTINATION: "result_metadata.robustness_evidence";
export declare const WORKSPACE_PREDICTION_PUBLICATION_DOCS_ANCHOR: "workspace-prediction-bridge";
export interface KeywordRegistryWorkspacePredictionPublicationContract {
    complete: boolean;
    docsAnchor: typeof WORKSPACE_PREDICTION_PUBLICATION_DOCS_ANCHOR;
    effects: readonly string[];
    fields: KeywordRegistryFieldView[];
    keywordIds: readonly WorkspacePredictionPublicationKeywordId[];
    missingKeywordIds: WorkspacePredictionPublicationKeywordId[];
    robustnessEvidenceDestination: typeof WORKSPACE_PREDICTION_PUBLICATION_DESTINATION;
}
export interface KeywordRegistryEntryQuery {
    alias?: string;
    id?: string;
    path?: string;
    surface?: string;
    token?: string;
}
export declare function isKeywordRegistryEntry(value: unknown): value is KeywordRegistryEntry;
export declare function isKeywordRegistryDocument(value: unknown): value is KeywordRegistryDocument;
export declare function parseKeywordRegistryDocument(value: unknown): KeywordRegistryDocument;
export declare function keywordRegistryEntriesById(registry: KeywordRegistryDocument): ReadonlyMap<string, KeywordRegistryEntry>;
export declare function keywordRegistryEntriesByPath(registry: KeywordRegistryDocument): ReadonlyMap<string, KeywordRegistryEntry>;
export declare function getKeywordRegistryEntry(registry: KeywordRegistryDocument, id: string): KeywordRegistryEntry | undefined;
export declare function findKeywordRegistryEntries(registry: KeywordRegistryDocument, query: KeywordRegistryEntryQuery): KeywordRegistryEntry[];
export declare function findKeywordRegistryEntriesByScope(registry: KeywordRegistryDocument, scope: string): KeywordRegistryEntry[];
export declare function resolveKeywordRegistryEntry(registry: KeywordRegistryDocument, query: KeywordRegistryEntryQuery): KeywordRegistryEntry | undefined;
export declare function createKeywordRegistryFieldViews(registry: KeywordRegistryDocument, options?: {
    group?: string;
    status?: KeywordRegistryStatus;
}): KeywordRegistryFieldView[];
export declare function createKeywordRegistryOptimizerPersistenceFields(registry: KeywordRegistryDocument): KeywordRegistryFieldView[];
export declare function createKeywordRegistryWorkspacePredictionPublicationContract(registry: KeywordRegistryDocument): KeywordRegistryWorkspacePredictionPublicationContract;
export declare function getKeywordRegistryValueOptions(entry: Pick<KeywordRegistryEntry, "value_schema">): KeywordRegistryValueOption[];
export declare function createKeywordRegistryFormSections(registry: KeywordRegistryDocument, options?: {
    status?: KeywordRegistryStatus;
}): KeywordRegistryFormSection[];
//# sourceMappingURL=registry.d.ts.map