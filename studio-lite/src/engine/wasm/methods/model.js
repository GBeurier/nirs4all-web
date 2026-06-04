// SPDX-License-Identifier: CECILL-2.1
//
// PLS regression model wrapper. Internally uses the `n4m_wasm_pls_fit`
// helper which takes raw double pointers and works around an Emscripten
// 5.0.7 codegen issue for matrix-view-pointer args (see README "Status").
import { checkStatus, getModule } from "./ffi.js";
function _malloc_f64(M, len) {
    const ptr = M._malloc(len * 8);
    return { ptr, len };
}
function _copy_in(M, buf, ptr) {
    if (buf.length === 0)
        return;
    M.HEAPF64.set(buf, ptr >>> 3);
}
function _read_out(M, ptr, len) {
    return new Float64Array(M.HEAPU8.buffer, ptr, len).slice();
}
/** Fit a SIMPLS PLS-regression model on (X, Y).
 *
 * @param X row-major (n × p) input matrix.
 * @param Y row-major (n × q) target matrix.
 * @param n_components number of latent components.
 */
export function fitPls(X, Y, n_components) {
    if (X.rows !== Y.rows) {
        throw new Error(`X.rows (${X.rows}) must equal Y.rows (${Y.rows})`);
    }
    const M = getModule();
    const n = X.rows, p = X.cols, q = Y.cols;
    const xBuf = _malloc_f64(M, n * p);
    const yBuf = _malloc_f64(M, n * q);
    const coefsBuf = _malloc_f64(M, p * q);
    const xmBuf = _malloc_f64(M, p);
    const ymBuf = _malloc_f64(M, q);
    try {
        _copy_in(M, X.data, xBuf.ptr);
        _copy_in(M, Y.data, yBuf.ptr);
        // Uses the public ABI helper (1.13+): raw double pointers
        // + ints, no matrix-view structs in the JS↔WASM boundary.
        const status = M.ccall("n4m_pls_fit_simple", "number", ["number", "number", "number", "number", "number",
            "number", "number", "number", "number", "number"], [xBuf.ptr, yBuf.ptr, n, p, q, n_components,
            coefsBuf.ptr, xmBuf.ptr, ymBuf.ptr, 0]);
        checkStatus(status);
        return {
            coefficients: _read_out(M, coefsBuf.ptr, p * q),
            xMean: _read_out(M, xmBuf.ptr, p),
            yMean: _read_out(M, ymBuf.ptr, q),
            n_features: p,
            n_targets: q,
        };
    }
    finally {
        M._free(xBuf.ptr);
        M._free(yBuf.ptr);
        M._free(coefsBuf.ptr);
        M._free(xmBuf.ptr);
        M._free(ymBuf.ptr);
    }
}
/** Predict from a fitted PlsModel for new X (row-major n_new × p). */
export function predictPls(model, X_new) {
    if (X_new.cols !== model.n_features) {
        throw new Error(`X_new.cols (${X_new.cols}) must equal n_features (` +
            `${model.n_features})`);
    }
    const M = getModule();
    const n_new = X_new.rows, p = model.n_features, q = model.n_targets;
    const xBuf = _malloc_f64(M, n_new * p);
    const coefsBuf = _malloc_f64(M, p * q);
    const xmBuf = _malloc_f64(M, p);
    const ymBuf = _malloc_f64(M, q);
    const predsBuf = _malloc_f64(M, n_new * q);
    try {
        _copy_in(M, X_new.data, xBuf.ptr);
        _copy_in(M, model.coefficients, coefsBuf.ptr);
        _copy_in(M, model.xMean, xmBuf.ptr);
        _copy_in(M, model.yMean, ymBuf.ptr);
        const status = M.ccall("n4m_wasm_pls_predict_from_coeffs", "number", ["number", "number", "number", "number",
            "number", "number", "number", "number"], [xBuf.ptr, n_new, p, q,
            coefsBuf.ptr, xmBuf.ptr, ymBuf.ptr, predsBuf.ptr]);
        checkStatus(status);
        return {
            data: _read_out(M, predsBuf.ptr, n_new * q),
            rows: n_new,
            cols: q,
        };
    }
    finally {
        M._free(xBuf.ptr);
        M._free(coefsBuf.ptr);
        M._free(xmBuf.ptr);
        M._free(ymBuf.ptr);
        M._free(predsBuf.ptr);
    }
}
/* Legacy class wrapper preserved for backwards compat with the
 * scaffold; not yet exposed via index.ts. */
export class Model {
    _data;
    constructor(data) { this._data = data; }
    static fit(_ctx, _cfg, X, Y, n_components = 3) {
        return new Model(fitPls(X, Y, n_components));
    }
    predict(_ctx, X_new) {
        return predictPls(this._data, X_new);
    }
    get coefficients() { return this._data.coefficients; }
    get xMean() { return this._data.xMean; }
    get yMean() { return this._data.yMean; }
    destroy() { }
}
