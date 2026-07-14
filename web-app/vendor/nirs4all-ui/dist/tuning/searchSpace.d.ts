export declare const TUNING_ORDERED_SEARCH_SPACE_FORMAT: "nirs4all.tuning.ordered_search_space";
export declare const TUNING_ORDERED_SEARCH_SPACE_SCHEMA_VERSION: 1;
export declare const TUNING_ORDERED_SEARCH_SPACE_SCHEMA_ID: "https://nirs4all.org/schemas/tuning-ordered-search-space/v1";
export type JsonNativeValue = null | boolean | number | string | JsonNativeValue[] | {
    [key: string]: JsonNativeValue;
};
export interface TuningSearchSpaceParameter {
    index: number;
    path: string;
    segments: string[];
    spec: JsonNativeValue;
}
export interface TuningParameterPatch {
    path: string;
    segments: string[];
    value: JsonNativeValue;
}
export interface OrderedTuningSearchSpaceArtifact {
    fingerprint: string;
    force_params: TuningParameterPatch[];
    format: typeof TUNING_ORDERED_SEARCH_SPACE_FORMAT;
    parameters: TuningSearchSpaceParameter[];
    schema_version: typeof TUNING_ORDERED_SEARCH_SPACE_SCHEMA_VERSION;
    tuning_fingerprint: string;
}
export interface TuningSearchSpaceParameterRow {
    forced: boolean;
    forcedValue: JsonNativeValue | null;
    forcedValueLabel: string | null;
    index: number;
    path: string;
    segments: string[];
    spec: JsonNativeValue;
    specLabel: string;
}
export interface TuningSearchSpacePreview {
    fingerprint: string;
    forceParamCount: number;
    forceParams: TuningParameterPatch[];
    format: typeof TUNING_ORDERED_SEARCH_SPACE_FORMAT;
    parameterCount: number;
    parameters: TuningSearchSpaceParameterRow[];
    schemaId: typeof TUNING_ORDERED_SEARCH_SPACE_SCHEMA_ID;
    schemaVersion: typeof TUNING_ORDERED_SEARCH_SPACE_SCHEMA_VERSION;
    tuningFingerprint: string;
}
export declare function isJsonNativeValue(value: unknown): value is JsonNativeValue;
export declare function isTuningSearchSpaceParameter(value: unknown): value is TuningSearchSpaceParameter;
export declare function isTuningParameterPatch(value: unknown): value is TuningParameterPatch;
export declare function isOrderedTuningSearchSpaceArtifact(value: unknown): value is OrderedTuningSearchSpaceArtifact;
export declare function parseOrderedTuningSearchSpaceArtifact(value: unknown): OrderedTuningSearchSpaceArtifact;
export declare function formatTuningSearchSpaceValue(value: JsonNativeValue): string;
export declare function createTuningSearchSpacePreview(artifact: OrderedTuningSearchSpaceArtifact): TuningSearchSpacePreview;
//# sourceMappingURL=searchSpace.d.ts.map