import { describe, expect, it, vi } from 'vitest'
import {
  axisRangesToFeatureRanges,
  buildGrouping,
  type ExplainBinding,
  resolveExplainAxis,
  runExplain,
  seededSubsample,
  validateExplainRequest,
} from './explain'
import { isRtErrorException } from './rt'
import type { AttributionResult, ExplainModelInput, FeatureGrouping } from './wasm/methods/index.js'
import type { ExplainRequest, FittedPipeline } from './types'

const P = 6
const model = { dsl: { name: 'm', steps: [] }, taskType: 'regression', nFeatures: P, state: {} } as unknown as FittedPipeline

/** 10 rows; row i holds i in every column so selected rows are recognisable. */
function rows(n: number, offset = 0) {
  const X = new Float64Array(n * P)
  for (let i = 0; i < n; i++) X.fill(i + offset, i * P, (i + 1) * P)
  return { X, nRows: n, sourceIndices: Array.from({ length: n }, (_, i) => 100 + i), source: 'predicted_rows' as const }
}

const request = (over: Partial<ExplainRequest> = {}): ExplainRequest => ({
  model, nFeatures: P, rows: rows(10), background: rows(10), ...over,
})

/** Group bookkeeping mirrors the Methods contract (contiguous fixed width; ranges + uncovered runs). */
const groupsFixedWidth = (n: number, w: number): FeatureGrouping => {
  const nGroups = Math.ceil(n / w)
  return { featureGroup: Int32Array.from({ length: n }, (_, j) => Math.floor(j / w)), nGroups }
}
const groupsFromRanges = (n: number, ranges: ReadonlyArray<readonly [number, number]>): FeatureGrouping => {
  const fg = new Int32Array(n).fill(-1)
  ranges.forEach(([a, b], r) => fg.fill(r, a, b))
  const rangeOfGroup = ranges.map((_, r) => r)
  let g = ranges.length
  for (let j = 0; j < n; j++) {
    if (fg[j] !== -1) continue
    while (j < n && fg[j] === -1) fg[j++] = g
    rangeOfGroup.push(-1)
    g++
    j--
  }
  return { featureGroup: fg, nGroups: g, rangeOfGroup: Int32Array.from(rangeOfGroup) }
}

/** A fake Methods session: predicts X once through the host callback, attributes it all to group 0. */
function fakeBinding(): ExplainBinding & { inputs: ExplainModelInput[] } {
  const inputs: ExplainModelInput[] = []
  return {
    inputs,
    groupsFixedWidth,
    groupsFromRanges,
    linearShap: () => {
      throw new Error('not used by these tests')
    },
    perturbRows: () => {
      throw new Error('not used by these tests')
    },
    summarizeAttributions: (r: AttributionResult, o = 0) => {
      const meanAbs = new Float64Array(r.nGroups)
      const meanSigned = new Float64Array(r.nGroups)
      for (let i = 0; i < r.nRows; i++) for (let g = 0; g < r.nGroups; g++) {
        const v = r.attributions[(i * r.nGroups + g) * r.nOutputs + o]
        meanAbs[g] += Math.abs(v) / r.nRows
        meanSigned[g] += v / r.nRows
      }
      return { meanAbs, meanSigned }
    },
    explainModel: async (input) => {
      inputs.push(input)
      const n = input.X.rows
      const pred = Float64Array.from(await input.predictBatch(input.X.data, n, input.X.cols))
      const nOutputs = pred.length / n
      const nGroups = input.grouping!.nGroups
      const attributions = new Float64Array(n * nGroups * nOutputs)
      for (let i = 0; i < n; i++) for (let o = 0; o < nOutputs; o++) attributions[i * nGroups * nOutputs + o] = pred[i * nOutputs + o] - 1
      input.onProgress?.(n, n)
      return {
        kind: input.options?.method ?? 'permutation_shap', baseline: input.options?.baseline ?? 'background',
        exactness: 'sampled', additive: true, groupAggregation: 'group_game',
        nRows: n, nGroups, nOutputs, nFeatures: input.X.cols,
        attributions, expected: new Float64Array(n * nOutputs).fill(1), predictions: pred,
        stdError: new Float64Array(n * nGroups * nOutputs), additivityMaxAbsError: 0, evaluations: n,
        settings: { n_permutations: input.options?.nPermutations ?? 10 },
        engine: { name: 'nirs4all-methods', version: 'test', abi: '0.0.0' },
      } satisfies AttributionResult
    },
  }
}

/** Two-output model: output k = (k + 1) * first feature. */
const predictMatrix = vi.fn(async (X: Float64Array, n: number, p: number) => {
  const data = new Float64Array(n * 2)
  for (let i = 0; i < n; i++) {
    data[i * 2] = X[i * p]
    data[i * 2 + 1] = 2 * X[i * p]
  }
  return { data, rows: n, cols: 2 }
})

describe('explain request validation', () => {
  const refusal = (req: ExplainRequest) => {
    try {
      validateExplainRequest(req)
    } catch (e) {
      expect(isRtErrorException(e)).toBe(true)
      return (e as { rtError: { verb: string; cause: string; unsupported_capability?: string; message: string } }).rtError
    }
    throw new Error('expected a refusal')
  }

  it('applies defaults', () => {
    expect(validateExplainRequest(request())).toMatchObject({
      method: 'permutation_shap', baseline: 'background', grouping: { kind: 'fixed_width', width: 20 },
      nPermutations: 10, seed: 0, maxRows: 10, maxBackground: 20, outputIndex: 0,
    })
  })

  it('refuses classifiers instead of explaining hard labels', () => {
    const e = refusal(request({ model: { ...model, taskType: 'binary' } }))
    expect(e).toMatchObject({ verb: 'explain', cause: 'unsupported_capability', unsupported_capability: 'class_probability_output' })
  })

  it('refuses shape mismatches, empty rows and missing background', () => {
    expect(refusal(request({ nFeatures: 5 })).message).toMatch(/expects 6 features/)
    expect(refusal(request({ rows: { ...rows(2), sourceIndices: [1] } })).message).toMatch(/source index/)
    expect(refusal(request({ rows: rows(0) })).message).toMatch(/no rows/)
    expect(refusal(request({ background: rows(0) })).message).toMatch(/needs background rows/)
    expect(() => validateExplainRequest(request({ background: rows(0), baseline: 'interpolate' }))).not.toThrow()
  })

  it('limits per-feature grouping and requires a recorded unit for band groups', () => {
    const wide = { ...model, nFeatures: 65 }
    const X = new Float64Array(65)
    // Per-wavelength grouping has no intrinsic ceiling; only host memory bounds an explanation.
    expect(validateExplainRequest(request({ model: wide, nFeatures: 65, rows: { X, nRows: 1, sourceIndices: [0], source: 'predicted_rows' }, background: { X, nRows: 1, sourceIndices: [0], source: 'predicted_rows' }, grouping: { kind: 'per_feature' } })).grouping).toEqual({ kind: 'per_feature' })
    const ranges = [{ label: 'b', axisStart: 1, axisEnd: 2 }]
    expect(refusal(request({ grouping: { kind: 'ranges', ranges }, axis: { values: [0, 1, 2, 3, 4, 5], unit: null } })).message).toMatch(/axis and its unit/)
    expect(() => validateExplainRequest(request({ grouping: { kind: 'ranges', ranges }, axis: { values: [0, 1, 2, 3, 4, 5], unit: 'nm' } }))).not.toThrow()
  })

  it('refuses invalid numeric settings', () => {
    expect(refusal(request({ nPermutations: 0 })).message).toMatch(/Permutations/)
    expect(refusal(request({ seed: -1 })).message).toMatch(/Seed/)
    expect(refusal(request({ maxRows: 1.5 })).message).toMatch(/Rows to explain/)
  })
})

describe('deterministic subsampling', () => {
  it('is reproducible for a seed, sorted, unique, and keeps everything when k >= n', () => {
    const a = seededSubsample(100, 10, 7)
    expect(seededSubsample(100, 10, 7)).toEqual(a)
    expect(new Set(a).size).toBe(10)
    expect([...a].sort((x, y) => x - y)).toEqual(a)
    expect(a.every((i) => i >= 0 && i < 100)).toBe(true)
    expect(seededSubsample(100, 10, 8)).not.toEqual(a)
    expect(seededSubsample(5, 10, 3)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('axis and groups', () => {
  it('never invents a unit: unknown or index axes become feature_index with a null unit', () => {
    expect(resolveExplainAxis(null, 3)).toEqual({ values: [0, 1, 2], unit: null, kind: 'feature_index' })
    expect(resolveExplainAxis({ values: [10, 20, 30], unit: 'index' }, 3)).toEqual({ values: [0, 1, 2], unit: null, kind: 'feature_index' })
    expect(resolveExplainAxis({ values: [10, 20], unit: 'nm' }, 3).kind).toBe('feature_index')
    expect(resolveExplainAxis({ values: [1100, 1102, 1104], unit: 'nm' }, 3)).toEqual({ values: [1100, 1102, 1104], unit: 'nm', kind: 'wavelength' })
    expect(resolveExplainAxis({ values: [4000, 3998, 3996], unit: 'cm-1' }, 3).kind).toBe('wavenumber')
  })

  it('maps axis ranges to disjoint half-open feature ranges', () => {
    const axis = [1000, 1010, 1020, 1030, 1040, 1050]
    expect(axisRangesToFeatureRanges(axis, [
      { label: 'b', axisStart: 1025, axisEnd: 1045 },
      { label: 'a', axisStart: 1000, axisEnd: 1030 },
      { label: 'none', axisStart: 2000, axisEnd: 2100 },
    ])).toEqual([{ start: 0, end: 4, label: 'a' }, { start: 4, end: 5, label: 'b' }])
  })

  it('describes fixed-width and band groups with axis ranges and remainder sources', () => {
    const axis = resolveExplainAxis({ values: [1000, 1010, 1020, 1030, 1040, 1050], unit: 'nm' }, P)
    const fixed = buildGrouping({ groupsFixedWidth, groupsFromRanges }, { kind: 'fixed_width', width: 4 }, axis, P)
    expect(fixed.groups).toEqual([
      { label: '1000–1030', feature_start: 0, feature_end: 4, axis_start: 1000, axis_end: 1030, source: 'fixed_width' },
      { label: '1040–1050', feature_start: 4, feature_end: 6, axis_start: 1040, axis_end: 1050, source: 'fixed_width' },
    ])
    const bands = buildGrouping({ groupsFixedWidth, groupsFromRanges }, { kind: 'ranges', ranges: [{ label: 'C-H', axisStart: 1010, axisEnd: 1020 }] }, axis, P)
    expect(bands.groups.map((g) => [g.label, g.feature_start, g.feature_end, g.source])).toEqual([
      ['C-H', 1, 3, 'ranges'], ['1000', 0, 1, 'remainder'], ['1030–1050', 3, 6, 'remainder'],
    ])
  })
})

describe('runExplain envelope', () => {
  it('maps explained rows to their source indices and reports the selected output', async () => {
    const binding = fakeBinding()
    const progress = vi.fn()
    const res = await runExplain(request({ maxRows: 3, seed: 11, outputIndex: 1, outputLabel: 'protein', grouping: { kind: 'fixed_width', width: 3 } }), binding, predictMatrix, { onProgress: progress })
    const env = res.envelope
    const positions = seededSubsample(10, 3, 11)
    expect(env.schema).toBe('nirs4all.explanation.v1')
    expect(env.rows).toEqual({ count: 3, sample_indices: positions.map((p) => 100 + p), source: 'predicted_rows' })
    // explained-row i carries the values of source row sample_indices[i]
    expect(Array.from(res.explainedX.subarray(0, P))).toEqual(new Array(P).fill(positions[0]))
    expect(env.prediction).toEqual(positions.map((p) => [p, 2 * p]))
    expect(env.output).toEqual({ index: 1, label: 'protein', space: 'target' })
    expect(env.summary.output_index).toBe(1)
    expect(env.summary.mean_abs).toHaveLength(2)
    expect(env.axis).toEqual({ values: [0, 1, 2, 3, 4, 5], unit: null, kind: 'feature_index' })
    expect(env.groups[0]).toMatchObject({ label: '#0–2', feature_start: 0, feature_end: 3, source: 'fixed_width' })
    expect(env.attribution_space).toBe('raw_input')
    expect(env.settings).toMatchObject({ baseline: 'background', n_background: 10, seed: 11, n_permutations: 10, max_rows: 3, n_candidate_rows: 10 })
    expect(env.feature_names).toBeNull()
    expect(env.std_error).not.toBeNull()
    expect(progress).toHaveBeenCalledWith({ done: 3, total: 3 })
    expect(binding.inputs[0].options).toMatchObject({ method: 'permutation_shap', baseline: 'background', nPermutations: 10, seed: 11 })
  })

  it('omits the background for the interpolate baseline and refuses an out-of-range output', async () => {
    const binding = fakeBinding()
    await runExplain(request({ baseline: 'interpolate' }), binding, predictMatrix)
    expect(binding.inputs[0].background).toBeUndefined()
    await expect(runExplain(request({ outputIndex: 2 }), fakeBinding(), predictMatrix)).rejects.toThrow(/outside the model's 2 outputs/)
  })

  it('refuses exact SHAP above 16 groups before any model evaluation', async () => {
    const binding = fakeBinding()
    const wide = 40
    const X = new Float64Array(wide)
    const r = { X, nRows: 1, sourceIndices: [0], source: 'predicted_rows' as const }
    await expect(runExplain({ model: { ...model, nFeatures: wide }, nFeatures: wide, rows: r, background: r, method: 'exact_shap', grouping: { kind: 'fixed_width', width: 2 } }, binding, predictMatrix))
      .rejects.toThrow(/limited to 16 groups/)
    expect(binding.inputs).toHaveLength(0)
  })
})
