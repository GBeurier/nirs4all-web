import type { ReactNode } from "react";
import { type PlotPadding } from "./geometry.js";
import type { ConformalPredictionRow } from "../conformal/result.js";
/** One nested prediction interval at a nominal coverage level. */
export interface ConformalBand {
    /** Nominal (target) coverage in [0, 1], e.g. 0.9 for a 90% interval. */
    coverage: number;
    lower: number;
    upper: number;
}
/** A single calibrated prediction: a point estimate wrapped by nested intervals. */
export interface ConformalStripSample {
    prediction: number;
    bands: readonly ConformalBand[];
    /** Ground-truth value, when known — drives the covered/missed marker. */
    actual?: number | null;
    label?: string | null;
}
export interface ConformalIntervalStripProps {
    samples: readonly ConformalStripSample[];
    width?: number;
    height?: number;
    padding?: PlotPadding;
    /** Ordering of the sample columns along x. */
    sort?: "index" | "prediction" | "width";
    /**
     * Coverage level treated as the headline guarantee: its band drives the
     * covered/missed classification and the observed-coverage badge. Defaults to
     * the widest coverage present.
     */
    targetCoverage?: number | null;
    unit?: string;
    /** Cap the number of drawn columns (keeps very large test sets responsive). */
    maxSamples?: number;
    coveredColor?: string;
    missedColor?: string;
    predictionColor?: string;
    /** Sequential ramp (pale → dark) for widest → narrowest nested band. */
    bandStops?: readonly string[];
    title?: string;
    yLabel?: string;
    xLabel?: string;
    className?: string;
    children?: ReactNode;
}
/** Sequential teal ramp: widest coverage (least certain area) is palest. */
export declare const CONFORMAL_BAND_STOPS: readonly ["#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e"];
/** Map a widest→narrowest rank fraction in [0, 1] to a band shade. */
export declare function conformalBandShade(rankFraction: number, stops?: readonly string[]): string;
/**
 * Adapt the `conformal` domain's per-sample prediction rows (from
 * {@link file://../conformal/result.ts createConformalPredictionRows}) into
 * strip samples, optionally attaching aligned ground-truth values.
 */
export declare function conformalStripSamplesFromRows(rows: readonly ConformalPredictionRow[], actuals?: readonly (number | null | undefined)[]): ConformalStripSample[];
/**
 * Per-sample **nested prediction-interval envelope** — the whole calibrated
 * prediction set at a glance. Each sample is a column of concentric conformal
 * bands (widest coverage palest at the back, narrowest core darkest at the
 * front) centered on the point estimate; when ground truth is supplied it is
 * dropped in as a covered/missed marker so empirical coverage and heteroscedastic
 * uncertainty read together. Pure inline SVG; hosts pass already-shaped samples
 * (adapt `conformal` rows with {@link conformalStripSamplesFromRows}).
 */
export declare function ConformalIntervalStrip({ samples, width, height, padding, sort, targetCoverage, unit, maxSamples, coveredColor, missedColor, predictionColor, bandStops, title, yLabel, xLabel, className, children, }: ConformalIntervalStripProps): import("react").JSX.Element;
//# sourceMappingURL=ConformalIntervalStrip.d.ts.map