/**
 * Pure geometry + descriptive-statistics helpers for the `viz` domain.
 *
 * Framework-free: these turn numeric data into SVG-ready coordinates, paths,
 * axis ticks, histograms, and summary statistics. Every presentational chart in
 * this package is built on top of these so the scale math stays in one tested
 * place and the components stay declarative.
 */
export interface Extent {
    min: number;
    max: number;
}
/** Inner drawing box after padding is applied. */
export interface PlotFrame {
    width: number;
    height: number;
    padding: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    innerWidth: number;
    innerHeight: number;
}
export interface PlotPadding {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
}
export declare function clamp(value: number, lo: number, hi: number): number;
export declare function buildFrame(width: number, height: number, padding?: PlotPadding): PlotFrame;
/** Min/max of a numeric list; falls back to [0, 1] when empty. */
export declare function extentOf(values: readonly number[]): Extent;
/** Extent padded by a fraction of its span on both ends. */
export declare function niceExtent(values: readonly number[], padFraction?: number): Extent;
/** Symmetric extent covering several lists (useful for parity plots). */
export declare function sharedExtent(...lists: ReadonlyArray<readonly number[]>): Extent;
/**
 * Map a value from a data domain to a pixel range. Returns a function so a
 * scale can be reused for every point in a series.
 */
export declare function makeScale(domain: Extent, rangeMin: number, rangeMax: number): (value: number) => number;
/** Evenly spaced, human-friendly tick values across an extent. */
export declare function ticks(extent: Extent, count?: number): number[];
/** SVG `M…L…` path from `[x, y]` pixel points. */
export declare function linePath(points: ReadonlyArray<readonly [number, number]>): string;
/** `points` attribute string for `<polyline>` / `<polygon>`. */
export declare function polylinePoints(points: ReadonlyArray<readonly [number, number]>): string;
/**
 * Closed area between an upper and lower pixel boundary (min/max spectra band).
 * `upper` is drawn left→right, `lower` right→left.
 */
export declare function bandPath(upper: ReadonlyArray<readonly [number, number]>, lower: ReadonlyArray<readonly [number, number]>): string;
export interface HistogramBin {
    x0: number;
    x1: number;
    mid: number;
    count: number;
}
/** Equal-width histogram bins over `values`. */
export declare function histogram(values: readonly number[], binCount?: number): HistogramBin[];
/** Quantile of an already-sorted ascending list (linear interpolation). */
export declare function quantileSorted(sorted: readonly number[], q: number): number;
export interface FiveNumberSummary {
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    mean: number;
}
export declare function fiveNumberSummary(values: readonly number[]): FiveNumberSummary;
export declare function mean(values: readonly number[]): number;
export declare function stdDev(values: readonly number[]): number;
export interface LinearFit {
    slope: number;
    intercept: number;
}
/** Ordinary-least-squares fit of `ys` on `xs`. */
export declare function linearFit(xs: readonly number[], ys: readonly number[]): LinearFit;
/** Pearson correlation coefficient. */
export declare function pearson(xs: readonly number[], ys: readonly number[]): number;
/** Round to 2 decimals for compact SVG coordinate strings. */
export declare function round(value: number): number;
//# sourceMappingURL=geometry.d.ts.map