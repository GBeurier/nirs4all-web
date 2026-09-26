import type { Matrix } from "./types.js";
declare const KINDS: {
    readonly GaussianNoise: readonly [0, 1];
    readonly MultiplicativeNoise: readonly [1, 1];
    readonly SpikeNoise: readonly [2, 4];
    readonly HeteroNoise: readonly [3, 2];
    readonly LinearDrift: readonly [4, 4];
    readonly PathLength: readonly [5, 2];
    readonly BandPerturb: readonly [6, 7];
    readonly BandMask: readonly [7, 5];
    readonly ChannelDropout: readonly [8, 2];
    readonly GaussJitter: readonly [9, 3];
    readonly UnsharpMask: readonly [10, 4];
    readonly LocalClip: readonly [11, 3];
    readonly RotateTranslate: readonly [12, 2];
    readonly RandomXOp: readonly [13, 3];
    readonly ScatterSimMSC: readonly [14, 4];
    readonly DeadBand: readonly [15, 6];
    readonly BatchEffect: readonly [16, 4];
    readonly SplineSmoothing: readonly [17, 0];
    readonly SplineXPerturb: readonly [18, 4];
    readonly SplineYPerturb: readonly [19, 2];
    readonly SplineXSimplify: readonly [20, 2];
    readonly SplineCurveSimplify: readonly [21, 2];
};
export type NativeAugmentationKind = keyof typeof KINDS;
/** Apply one seeded native augmenter to training X; no Y or fitted state. */
export declare function augmentNative(kind: NativeAugmentationKind, X: Matrix, params: readonly number[], seed?: number | bigint): Matrix;
export {};
