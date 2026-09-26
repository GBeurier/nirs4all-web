import { Matrix } from "./types.js";
export declare const selectorMethods: readonly string[];
/** Run one of the 25 native selectors, preserving its ranked int64 indices. */
export declare function selectVariables(method: string, X: Matrix, Y: Matrix, nComponents?: number, methodParams?: Record<string, unknown>): BigInt64Array;
/** Compatibility convenience wrapper for the native SPA selector. */
export declare function selectSpa(X: Matrix, Y: Matrix, topK: number, nComponents?: number): BigInt64Array;
