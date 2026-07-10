/**
 * Simple, extensible auto-detection of column roles + source signal type.
 *
 * Deliberately conservative: identifiers / replicate / partition / spectral X
 * are matched with high confidence; Y is only *proposed* (semanticType set) when
 * a column looks like a target, never assigned aggressively over real data.
 * Pure and deterministic so it can be unit-tested and reused server-side.
 */
import type { DatasetColumn, DatasetSource, SemanticType, SignalType } from "./types.js";
export declare const PARTITION_VALUES: Set<string>;
/** Is the header a bare wavelength — `wavelength_1000`, `1000`, `1650.5`, `1000nm`? */
export declare function isSpectralHeader(name: string): boolean;
/** Detect the signal type of a source from its columns + declared file type. */
export declare function guessSignalType(columns: DatasetColumn[], fileType: string): SignalType;
interface Detected {
    assignedRole: DatasetColumn["assignedRole"];
    semanticType?: SemanticType;
}
/**
 * Detect a role for a single column given its neighbourhood. `spectralRun`
 * marks columns that belong to a contiguous numeric block even if their headers
 * are not literal wavelengths.
 */
export declare function detectColumnRole(column: DatasetColumn, spectralRun: boolean): Detected;
/** Return a new column array with auto-detected roles, preserving manual ones. */
export declare function autoDetectColumns(columns: DatasetColumn[]): DatasetColumn[];
/** Full auto-detection pass over a source: signal type + column roles. */
export declare function autoDetectSource(source: DatasetSource): DatasetSource;
export {};
//# sourceMappingURL=detect.d.ts.map