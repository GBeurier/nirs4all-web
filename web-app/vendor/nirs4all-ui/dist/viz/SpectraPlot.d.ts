import type { ReactNode } from "react";
import { type PlotPadding } from "./geometry.js";
import { type PartitionKey } from "./theme.js";
/** One overlaid spectrum (absorbance values aligned to the shared wavelength axis). */
export interface SpectraSeries {
    id: string;
    values: readonly number[];
    color?: string;
    label?: string;
    partition?: PartitionKey;
    opacity?: number;
}
/** Translucent min/max (or ±σ) envelope drawn behind the lines. */
export interface SpectraBand {
    lower: readonly number[];
    upper: readonly number[];
    color?: string;
    opacity?: number;
}
export interface SpectraPlotProps {
    /** Shared wavelength / wavenumber axis. */
    wavelengths: readonly number[];
    /** Overlaid per-sample spectra (colored by `partition` unless `color` is set). */
    series?: readonly SpectraSeries[];
    /** Emphasized mean spectrum drawn on top. */
    mean?: readonly number[];
    /** min/max envelope. */
    band?: SpectraBand | null;
    width?: number;
    height?: number;
    padding?: PlotPadding;
    unit?: string;
    xLabel?: string;
    yLabel?: string;
    showGrid?: boolean;
    showAxes?: boolean;
    meanColor?: string;
    title?: string;
    className?: string;
    /** Extra SVG content rendered in data space last (annotations, legends). */
    children?: ReactNode;
}
/**
 * The signature NIRS chart: absorbance vs. wavelength. Overlays per-sample
 * lines (colored by partition), an optional emphasized mean, and a translucent
 * min/max band. Pure inline SVG — no chart library, no state. Hosts pass
 * already-aligned numeric arrays.
 */
export declare function SpectraPlot({ wavelengths, series, mean, band, width, height, padding, unit, xLabel, yLabel, showGrid, showAxes, meanColor, title, className, children, }: SpectraPlotProps): import("react").JSX.Element;
//# sourceMappingURL=SpectraPlot.d.ts.map