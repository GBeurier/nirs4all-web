// Minimal row-major dense matrix helpers + seedable PRNG for the JS stub engine.
// (The shipped engine delegates numerics to libn4m; this keeps the stub honest
// and dependency-free so the whole UX runs before the WASM execution binding lands.)

export interface Mat {
  data: Float64Array // row-major
  rows: number
  cols: number
}

export function mat(rows: number, cols: number): Mat {
  return { data: new Float64Array(rows * cols), rows, cols }
}

export function rowView(m: Mat, r: number): Float64Array {
  return m.data.subarray(r * m.cols, (r + 1) * m.cols)
}

/** Gather selected rows (by index) into a fresh matrix. */
export function selectRows(m: Mat, idx: number[]): Mat {
  const out = mat(idx.length, m.cols)
  for (let i = 0; i < idx.length; i++) {
    out.data.set(m.data.subarray(idx[i] * m.cols, (idx[i] + 1) * m.cols), i * m.cols)
  }
  return out
}

export function colMeans(m: Mat): Float64Array {
  const mean = new Float64Array(m.cols)
  for (let r = 0; r < m.rows; r++) {
    const base = r * m.cols
    for (let c = 0; c < m.cols; c++) mean[c] += m.data[base + c]
  }
  for (let c = 0; c < m.cols; c++) mean[c] /= Math.max(1, m.rows)
  return mean
}

export function colStds(m: Mat, mean: Float64Array): Float64Array {
  const std = new Float64Array(m.cols)
  for (let r = 0; r < m.rows; r++) {
    const base = r * m.cols
    for (let c = 0; c < m.cols; c++) {
      const d = m.data[base + c] - mean[c]
      std[c] += d * d
    }
  }
  for (let c = 0; c < m.cols; c++) std[c] = Math.sqrt(std[c] / Math.max(1, m.rows - 1)) || 1
  return std
}

/** In-place center (and optionally scale) columns. */
export function centerScale(m: Mat, mean: Float64Array, std?: Float64Array): void {
  for (let r = 0; r < m.rows; r++) {
    const base = r * m.cols
    for (let c = 0; c < m.cols; c++) {
      m.data[base + c] -= mean[c]
      if (std) m.data[base + c] /= std[c]
    }
  }
}

/** Invert a small (n×n) dense matrix via Gauss–Jordan with partial pivoting. */
export function invSmall(a: number[][]): number[][] {
  const n = a.length
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r
    if (Math.abs(m[piv][col]) < 1e-12) m[piv][col] = 1e-12
    ;[m[col], m[piv]] = [m[piv], m[col]]
    const d = m[col][col]
    for (let j = 0; j < 2 * n; j++) m[col][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = m[r][col]
      if (f === 0) continue
      for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[col][j]
    }
  }
  return m.map((row) => row.slice(n))
}

// --- seedable PRNG (mulberry32) ---
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic Fisher–Yates shuffle of 0..n-1. */
export function shuffledIndices(n: number, seed: number): number[] {
  const rng = mulberry32(seed)
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
}
