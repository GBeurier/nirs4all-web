// NIPALS PLS (PLS1/PLS2) — used by the JS stub engine for regression and, on
// one-hot targets, for PLS-DA. This is real PLS numerics (not a mock); the
// shipped engine swaps this for libn4m via dag-ml.
import { type Mat, mat, colMeans, invSmall } from './linalg'

export interface PlsModel {
  meanX: Float64Array
  meanY: Float64Array
  B: Float64Array // regression coefficients in centered space, p×q row-major
  nFeatures: number
  yCols: number
  nComp: number
}

function copyMat(m: Mat): Mat {
  return { data: Float64Array.from(m.data), rows: m.rows, cols: m.cols }
}
function centerCols(m: Mat, mean: Float64Array): void {
  for (let r = 0; r < m.rows; r++) {
    const base = r * m.cols
    for (let c = 0; c < m.cols; c++) m.data[base + c] -= mean[c]
  }
}

export function plsFit(X: Mat, Y: Mat, nComp: number): PlsModel {
  const n = X.rows
  const p = X.cols
  const q = Y.cols
  const A = Math.max(1, Math.min(nComp, n - 1, p))

  const meanX = colMeans(X)
  const meanY = colMeans(Y)
  const Xc = copyMat(X)
  centerCols(Xc, meanX)
  const Yc = copyMat(Y)
  centerCols(Yc, meanY)

  const W: number[][] = [] // each entry length p
  const P: number[][] = []
  const Q: number[][] = [] // each entry length q

  for (let a = 0; a < A; a++) {
    // init u from the (deflated) Y column with the largest norm — robust when a
    // class is absent from a fold (column 0 could be all-zero for PLS-DA).
    let bestCol = 0
    if (q > 1) {
      let bestNorm = -1
      for (let k = 0; k < q; k++) {
        let s = 0
        for (let i = 0; i < n; i++) {
          const v = Yc.data[i * q + k]
          s += v * v
        }
        if (s > bestNorm) (bestNorm = s), (bestCol = k)
      }
    }
    let u = new Float64Array(n)
    for (let i = 0; i < n; i++) u[i] = Yc.data[i * q + bestCol]
    const w = new Float64Array(p)
    const t = new Float64Array(n)
    const c = new Float64Array(q)

    for (let it = 0; it < 200; it++) {
      // w = Xc^T u ; normalize
      w.fill(0)
      for (let i = 0; i < n; i++) {
        const ui = u[i]
        const base = i * p
        for (let j = 0; j < p; j++) w[j] += Xc.data[base + j] * ui
      }
      let nw = 0
      for (let j = 0; j < p; j++) nw += w[j] * w[j]
      nw = Math.sqrt(nw) || 1e-12
      for (let j = 0; j < p; j++) w[j] /= nw
      // t = Xc w
      t.fill(0)
      for (let i = 0; i < n; i++) {
        let s = 0
        const base = i * p
        for (let j = 0; j < p; j++) s += Xc.data[base + j] * w[j]
        t[i] = s
      }
      // c = Yc^T t / (t^T t)
      let tt = 0
      for (let i = 0; i < n; i++) tt += t[i] * t[i]
      tt = tt || 1e-12
      c.fill(0)
      for (let i = 0; i < n; i++) {
        const ti = t[i]
        const base = i * q
        for (let k = 0; k < q; k++) c[k] += Yc.data[base + k] * ti
      }
      for (let k = 0; k < q; k++) c[k] /= tt
      if (q === 1) break // PLS1: converges immediately
      // u_new = Yc c / (c^T c)
      let cc = 0
      for (let k = 0; k < q; k++) cc += c[k] * c[k]
      cc = cc || 1e-12
      const uNew = new Float64Array(n)
      let diff = 0
      let nrm = 0
      for (let i = 0; i < n; i++) {
        let s = 0
        const base = i * q
        for (let k = 0; k < q; k++) s += Yc.data[base + k] * c[k]
        uNew[i] = s / cc
        const d = uNew[i] - u[i]
        diff += d * d
        nrm += uNew[i] * uNew[i]
      }
      u = uNew
      if (diff / (nrm || 1) < 1e-12) break
    }

    // p_load = Xc^T t / (t^T t)
    let tt = 0
    for (let i = 0; i < n; i++) tt += t[i] * t[i]
    if (tt < 1e-14) break // degenerate component — stop
    const pl = new Float64Array(p)
    for (let i = 0; i < n; i++) {
      const ti = t[i]
      const base = i * p
      for (let j = 0; j < p; j++) pl[j] += Xc.data[base + j] * ti
    }
    for (let j = 0; j < p; j++) pl[j] /= tt
    // deflate
    for (let i = 0; i < n; i++) {
      const ti = t[i]
      const bx = i * p
      for (let j = 0; j < p; j++) Xc.data[bx + j] -= ti * pl[j]
      const by = i * q
      for (let k = 0; k < q; k++) Yc.data[by + k] -= ti * c[k]
    }
    W.push(Array.from(w))
    P.push(Array.from(pl))
    Q.push(Array.from(c))
  }

  const Aeff = W.length || 1
  if (W.length === 0) {
    // no usable component — return mean predictor
    return { meanX, meanY, B: new Float64Array(p * q), nFeatures: p, yCols: q, nComp: 0 }
  }
  // B = W (P^T W)^-1 Q^T
  const PtW: number[][] = Array.from({ length: Aeff }, () => new Array(Aeff).fill(0))
  for (let a = 0; a < Aeff; a++)
    for (let b = 0; b < Aeff; b++) {
      let s = 0
      for (let j = 0; j < p; j++) s += P[a][j] * W[b][j]
      PtW[a][b] = s
    }
  const inv = invSmall(PtW)
  const R: number[][] = Array.from({ length: p }, () => new Array(Aeff).fill(0))
  for (let j = 0; j < p; j++)
    for (let a = 0; a < Aeff; a++) {
      let s = 0
      for (let b = 0; b < Aeff; b++) s += W[b][j] * inv[b][a]
      R[j][a] = s
    }
  const B = new Float64Array(p * q)
  for (let j = 0; j < p; j++)
    for (let k = 0; k < q; k++) {
      let s = 0
      for (let a = 0; a < Aeff; a++) s += R[j][a] * Q[a][k]
      B[j * q + k] = s
    }
  return { meanX, meanY, B, nFeatures: p, yCols: q, nComp: Aeff }
}

export function plsPredict(model: PlsModel, X: Mat): Mat {
  const { meanX, meanY, B, yCols: q } = model
  const n = X.rows
  const p = X.cols
  const out = mat(n, q)
  for (let i = 0; i < n; i++) {
    const base = i * p
    for (let k = 0; k < q; k++) {
      let s = meanY[k]
      for (let j = 0; j < p; j++) s += (X.data[base + j] - meanX[j]) * B[j * q + k]
      out.data[i * q + k] = s
    }
  }
  return out
}
