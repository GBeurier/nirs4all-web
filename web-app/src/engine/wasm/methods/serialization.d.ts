import { Algorithm, Deflation, Solver } from "./types.js";
export declare const SERIALIZED_MODEL_INFO_SCHEMA_V1 = 1;
export declare const SERIALIZED_MODEL_CAPABILITY_PREDICT: bigint;
export declare const SERIALIZED_MODEL_CAPABILITY_TRANSFORM: bigint;
export declare const SERIALIZED_MODEL_CAPABILITY_AFFINE: bigint;
export declare const SERIALIZED_MODEL_CAPABILITY_PIPELINE: bigint;
export declare enum SerializedPipelineOperatorKind {
    Snv = 4,
    SavitzkyGolaySmooth = 8
}
export declare enum PipelineFingerprintAlgorithm {
    Fnv1a64V1 = 1
}
export declare enum PipelineSemanticProfile {
    Nirs4allSnvSavgolV1 = 1
}
export declare enum SerializedSavitzkyGolayMode {
    Interp = 4
}
export interface SerializedPipelineInfo {
    schemaVersion: number;
    operatorCount: number;
    operators: readonly [SerializedPipelineOperatorKind, SerializedPipelineOperatorKind];
    savgolWindow: number;
    savgolPolyDegree: number;
    savgolDerivative: number;
    semanticProfile: PipelineSemanticProfile;
    savgolDelta: number;
    rawNFeatures: number;
    modelNFeatures: number;
    fingerprintAlgorithm: PipelineFingerprintAlgorithm;
    fingerprint: bigint;
    snvAxis: number;
    snvWithMean: boolean;
    snvWithStd: boolean;
    snvDdof: number;
    savgolMode: SerializedSavitzkyGolayMode;
    savgolCval: number;
}
export interface SerializedModelInfo {
    schemaVersion: number;
    formatVersion: number;
    writerAbi: readonly [number, number, number];
    algorithm: Algorithm;
    solver: Solver;
    deflation: Deflation;
    trainingSamples: bigint;
    nFeatures: number;
    nTargets: number;
    nComponents: number;
    capabilities: bigint;
    pipeline: SerializedPipelineInfo | null;
}
/** Validate and inspect a complete N4MM payload without importing model state.
 *
 * The capability mask is copied from libn4m's validated result and is never
 * inferred from host-side JSON or other declarative metadata.
 */
export declare function inspectN4mm(payload: Uint8Array): SerializedModelInfo;
