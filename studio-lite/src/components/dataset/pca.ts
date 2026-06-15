// Dependency-free client-side PCA for the Explore scatter. NIRS datasets are
// typically wide (n samples ≪ p wavelengths), so we eigendecompose the n×n Gram
// matrix K = Xc·Xcᵀ (centered) by power-iteration + deflation and recover the
// principal scores from its top eigenpairs: for SVD Xc = U Σ Vᵀ, K = U Σ² Uᵀ, so
// the scores T[:,c] = u_c · σ_c = v_c · sqrt(λ_c) and the explained-variance
// ratio is λ_c / trace(K). No external linear-algebra dependency; the heavy
// numerics still belong to libn4m for the model path — this is explore-only viz.
import { mulberry32 } from '@/engine/algo/linalg'
import type { MaterializedDataset } from '@/engine/types'

export interface PcaResult {
  /** principal scores, length nUsed, one inner array of length nComp per sample */
  scores: number[][]
  /** explained-variance ratio per component (0..1) */
  explained: number[]
  /** number of components actually returned */
  nComp: number
  /** sample row indices used (a deterministic subsample if capped, else all) */
  usedIdx: number[]
}

/**
 * Top-`maxComp` PCA of the (column-centered) spectra. Samples beyond `maxSamples`
 * are deterministically subsampled to keep the Gram eigensolve interactive; the
 * returned `usedIdx` aligns `scores` back to dataset rows.
 */
export function computePca(ds: MaterializedDataset, maxComp = 4, maxSamples = 2000): PcaResult {
  const { nFeatures: p } = ds
  // pick the rows we eigensolve over (deterministic subsample when very large)
  let usedIdx: number[]
  if (ds.nSamples > maxSamples) {
    const rng = mulberry32(12345)
    const all = Array.from({ length: ds.nSamples }, (_, i) => i)
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[all[i], all[j]] = [all[j], all[i]]
    }
    usedIdx = all.slice(0, maxSamples).sort((a, b) => a - b)
  } else {
    usedIdx = Array.from({ length: ds.nSamples }, (_, i) => i)
  }
  const n = usedIdx.length
  const comps = Math.min(maxComp, Math.max(1, Math.min(n - 1, p)))

  // centered design Xc (n×p)
  const mean = new Float64Array(p)
  for (const r of usedIdx) {
    const base = r * p
    for (let c = 0; c < p; c++) mean[c] += ds.X[base + c]
  }
  for (let c = 0; c < p; c++) mean[c] /= Math.max(1, n)
  const Xc = new Float64Array(n * p)
  for (let i = 0; i < n; i++) {
    const base = usedIdx[i] * p
    const ob = i * p
    for (let c = 0; c < p; c++) Xc[ob + c] = ds.X[base + c] - mean[c]
  }

  // Gram K = Xc·Xcᵀ (n×n, symmetric PSD)
  const K = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    const ib = i * p
    for (let j = i; j < n; j++) {
      const jb = j * p
      let s = 0
      for (let c = 0; c < p; c++) s += Xc[ib + c] * Xc[jb + c]
      K[i * n + j] = s
      K[j * n + i] = s
    }
  }
  let trace = 0
  for (let i = 0; i < n; i++) trace += K[i * n + i]
  trace = trace || 1e-12

  const scores: number[][] = Array.from({ length: n }, () => new Array(comps).fill(0))
  const explained: number[] = []
  const v = new Float64Array(n)
  const w = new Float64Array(n)
  for (let c = 0; c < comps; c++) {
    // deterministic init, then power-iterate on the (deflated) K
    const rng = mulberry32(7 + c)
    for (let i = 0; i < n; i++) v[i] = rng() - 0.5
    normalize(v)
    let lambda = 0
    for (let it = 0; it < 160; it++) {
      // w = K v
      for (let i = 0; i < n; i++) {
        const ib = i * n
        let s = 0
        for (let j = 0; j < n; j++) s += K[ib + j] * v[j]
        w[i] = s
      }
      lambda = dot(v, w)
      const norm = normalizeInto(w, v)
      if (norm < 1e-12) break
    }
    const sigma = Math.sqrt(Math.max(lambda, 0))
    for (let i = 0; i < n; i++) scores[i][c] = v[i] * sigma
    explained.push(Math.max(lambda, 0) / trace)
    // deflate: K -= lambda · v vᵀ
    for (let i = 0; i < n; i++) {
      const ib = i * n
      const lvi = lambda * v[i]
      for (let j = 0; j < n; j++) K[ib + j] -= lvi * v[j]
    }
  }
  return { scores, explained, nComp: comps, usedIdx }
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
function normalize(a: Float64Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * a[i]
  const n = Math.sqrt(s) || 1
  for (let i = 0; i < a.length; i++) a[i] /= n
  return n
}
/** L2-normalize `src` into `dst`, returning the pre-normalization norm. */
function normalizeInto(src: Float64Array, dst: Float64Array): number {
  let s = 0
  for (let i = 0; i < src.length; i++) s += src[i] * src[i]
  const n = Math.sqrt(s)
  if (n < 1e-12) return n
  for (let i = 0; i < src.length; i++) dst[i] = src[i] / n
  return n
}
