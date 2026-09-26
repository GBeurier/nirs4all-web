import type { Matrix } from "./types.js";
export type NativeSplitterKind = "KennardStone" | "SPXY" | "SPXYFold" | "SPXYGroupFold" | "KMeans" | "KBinsStratified" | "BinnedStratGroupFold" | "SystematicCircular" | "DataTwinning";
export interface NativeSplitterOptions {
    testSize?: number;
    nSplits?: number;
    yMetric?: 0 | 1 | 2;
    aggregation?: 0 | 1;
    nBins?: number;
    strategy?: 0 | 1;
    shuffle?: boolean;
    maxIter?: number;
    seed?: number | bigint;
    /** Signed int64 group IDs, one per sample. Required by group-fold kinds. */
    groups?: readonly (number | bigint)[];
    /** Zero-based fold index for the three fold kinds; zero otherwise. */
    foldIndex?: number;
}
export interface NativeSplitIndices {
    trainIndices: Int32Array;
    testIndices: Int32Array;
}
/** Return the native ordered row indices without sorting or host-side splitting. */
export declare function splitNative(kind: NativeSplitterKind, X: Matrix | null, Y?: Matrix | null, options?: NativeSplitterOptions): NativeSplitIndices;
