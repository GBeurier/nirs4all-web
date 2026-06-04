export { loadModule, getModule, makeMatrixView, readArrayView } from "./ffi.js";
export { Context } from "./context.js";
export { Config } from "./config.js";
export { Model, fitPls, predictPls, type PlsModel } from "./model.js";
export { MethodResult } from "./methodResult.js";
export { Status, Dtype, Algorithm, Solver, Deflation, Pls4allError, type Matrix, } from "./types.js";
/** ABI / project version reported by the loaded WASM module. */
export declare function version(): string;
/** ABI MAJOR.MINOR.PATCH triple. */
export declare function abiVersion(): readonly [number, number, number];
