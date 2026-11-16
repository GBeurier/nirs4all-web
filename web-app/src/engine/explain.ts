// Explain host adapter: marshals an ExplainRequest into the Methods explain session
// (`explainModel`, ask/tell over a host predict callback) and wraps its result in the
// `nirs4all.explanation.v1` envelope. Every attribution, grouping and summary number is
// computed by Methods; this module only validates the request, selects rows by index,
// maps recorded axis ranges to feature indices and reshapes arrays.
import type {
  AttributionResult,
  ExplainModelInput,
  FeatureGrouping,
} from './wasm/methods/index.js'
import { makeRtError, RtErrorException } from './rt'
import type {
  ExplainAxis,
  ExplainGrouping,
  ExplainMethod,
  ExplainOptions,
  ExplainRequest,
  ExplainResponse,
  ExplainRows,
  ExplanationGroup,
  ExplanationGroupSource,
  ExplanationV1,
} from './types'

export const EXPLAIN_METHODS: readonly ExplainMethod[] = ['permutation_shap', 'kernel_shap', 'exact_shap', 'lime', 'occlusion']
export const EXPLAIN_DEFAULTS = {
  method: 'permutation_shap' as ExplainMethod,
  baseline: 'background' as const,
  fixedWidth: 20,
  nPermutations: 10,
  seed: 0,
  // Cost is rows x (1 + background x 2 x permutations x (groups - 1)) pipeline evaluations:
  // 10 rows x 20 background rows keep a 700-wavelength spectrum around half a minute in WASM.
  maxRows: 10,
  maxBackground: 20,
}
/** Exact group SHAP enumerates 2^G coalitions (native limit). */
export const EXACT_SHAP_MAX_GROUPS = 16
/** One group per feature is offered only for narrow inputs. */

/** The Methods binding surface this adapter uses (CONTRACTS §1). */
export interface ExplainBinding {
  explainModel(input: ExplainModelInput): Promise<AttributionResult>
  groupsFixedWidth(nFeatures: number, width: number): FeatureGrouping
  groupsFromRanges(nFeatures: number, ranges: ReadonlyArray<readonly [number, number]>): FeatureGrouping
  summarizeAttributions(result: AttributionResult, outputIndex?: number): { meanAbs: Float64Array; meanSigned: Float64Array }
}

/** Row-major prediction matrix of the complete pipeline (rows x outputs). */
export interface PredictionMatrix {
  data: Float64Array
  rows: number
  cols: number
}
export type PredictMatrixFn = (X: Float64Array, nRows: number, nFeatures: number) => Promise<PredictionMatrix>

export function explainRefusal(message: string, mitigation: string, capability?: string): RtErrorException {
  return new RtErrorException(makeRtError({
    verb: 'explain',
    cause: capability ? 'unsupported_capability' : 'invalid_request',
    message,
    mitigation,
    ...(capability ? { unsupported_capability: capability } : {}),
  }))
}

const invalid = (message: string, mitigation = 'Adjust the Explain settings and run again.'): never => {
  throw explainRefusal(message, mitigation)
}

const positiveInt = (value: number | undefined, fallback: number, name: string): number => {
  const v = value ?? fallback
  if (!Number.isSafeInteger(v) || v < 1) invalid(`${name} must be a positive integer (got ${v}).`)
  return v
}

function checkRows(rows: ExplainRows, nFeatures: number, name: string): void {
  if (!Number.isSafeInteger(rows.nRows) || rows.nRows < 0 || rows.X.length !== rows.nRows * nFeatures) {
    invalid(`${name} matrix shape does not match its buffer (${rows.nRows} x ${nFeatures}, ${rows.X.length} values).`)
  }
  if (rows.sourceIndices.length !== rows.nRows || rows.sourceIndices.some((i) => !Number.isSafeInteger(i) || i < 0)) {
    invalid(`${name} must carry one non-negative source index per row.`)
  }
}

/** Resolved, validated request settings (defaults applied). */
export interface ResolvedExplainSettings {
  method: ExplainMethod
  baseline: 'background' | 'interpolate' | 'mean'
  grouping: ExplainGrouping
  nPermutations: number
  seed: number
  maxRows: number
  maxBackground: number
  outputIndex: number
}

/** Validate a request before any model evaluation; throws a typed `explain` RtError. */
export function validateExplainRequest(req: ExplainRequest): ResolvedExplainSettings {
  const { nFeatures } = req
  if (!Number.isSafeInteger(nFeatures) || nFeatures < 1) invalid('The explained input has no features.')
  if (req.model.nFeatures !== nFeatures) invalid(`The model expects ${req.model.nFeatures} features; the explained rows have ${nFeatures}.`)
  if (req.model.taskType !== 'regression') {
    throw explainRefusal(
      'The browser predict paths return class scores that are not calibrated probabilities, or hard labels; Explain refuses to attribute them.',
      'Explain a regression model here, or use the nirs4all Python SDK for classifier probability explanations.',
      'class_probability_output',
    )
  }
  checkRows(req.rows, nFeatures, 'Explained rows')
  checkRows(req.background, nFeatures, 'Background rows')
  if (req.rows.nRows < 1) invalid('There are no rows to explain.')
  const method = req.method ?? EXPLAIN_DEFAULTS.method
  if (!EXPLAIN_METHODS.includes(method)) invalid(`Unknown explain method "${String(method)}".`)
  const baseline = req.baseline ?? EXPLAIN_DEFAULTS.baseline
  if (!['background', 'interpolate', 'mean'].includes(baseline)) invalid(`Unknown baseline "${String(baseline)}".`)
  if (baseline !== 'interpolate' && req.background.nRows < 1) {
    invalid(`The "${baseline}" baseline needs background rows.`, 'Load the training dataset or a prediction file, or use the "interpolate" baseline.')
  }
  const grouping = req.grouping ?? { kind: 'fixed_width', width: EXPLAIN_DEFAULTS.fixedWidth }
  if (grouping.kind === 'fixed_width') positiveInt(grouping.width, EXPLAIN_DEFAULTS.fixedWidth, 'Group width')
  if (grouping.kind === 'ranges') {
    if (!req.axis || req.axis.values.length !== nFeatures || axisKindOf(req.axis.unit).kind === 'feature_index') {
      invalid('Band groups need the recorded spectral axis and its unit.', 'Use fixed-width groups for inputs without a recorded axis unit.')
    }
    if (grouping.ranges.length < 1) invalid('No band falls inside this spectral range.', 'Use fixed-width groups.')
  }
  const nPermutations = positiveInt(req.nPermutations, EXPLAIN_DEFAULTS.nPermutations, 'Permutations')
  const seed = req.seed ?? EXPLAIN_DEFAULTS.seed
  if (!Number.isSafeInteger(seed) || seed < 0) invalid(`Seed must be a non-negative integer (got ${seed}).`)
  const maxRows = positiveInt(req.maxRows, EXPLAIN_DEFAULTS.maxRows, 'Rows to explain')
  const maxBackground = positiveInt(req.maxBackground, EXPLAIN_DEFAULTS.maxBackground, 'Background rows')
  const outputIndex = req.outputIndex ?? 0
  if (!Number.isSafeInteger(outputIndex) || outputIndex < 0) invalid(`Output index must be a non-negative integer (got ${outputIndex}).`)
  return { method, baseline, grouping, nPermutations, seed, maxRows, maxBackground, outputIndex }
}

/**
 * Deterministic subsample of `k` of `n` row positions (ascending), driven by `seed`
 * (SplitMix32-style generator + partial Fisher–Yates). All positions when k >= n.
 * Index selection only: no row value is read.
 */
export function seededSubsample(n: number, k: number, seed: number): number[] {
  if (k >= n) return Array.from({ length: n }, (_, i) => i)
  let state = (seed ^ 0x9e3779b9) >>> 0
  const next = (): number => {
    state = (state + 0x9e3779b9) >>> 0
    let z = state
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    return ((z ^ (z >>> 16)) >>> 0) / 0x100000000
  }
  const pool = Array.from({ length: n }, (_, i) => i)
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(next() * (n - i))
    const t = pool[i]
    pool[i] = pool[j]
    pool[j] = t
  }
  return pool.slice(0, k).sort((a, b) => a - b)
}

/** Copy the selected rows (positions into `rows`) into a new row-major buffer. */
export function takeRows(rows: ExplainRows, positions: number[], nFeatures: number): { X: Float64Array; sourceIndices: number[] } {
  const X = new Float64Array(positions.length * nFeatures)
  positions.forEach((p, r) => X.set(rows.X.subarray(p * nFeatures, (p + 1) * nFeatures), r * nFeatures))
  return { X, sourceIndices: positions.map((p) => rows.sourceIndices[p]) }
}

type AxisKind = ExplanationV1['axis']['kind']

/** Normalized recorded unit, or null when unknown (never invented). */
export function axisKindOf(unit: string | null | undefined): { unit: string | null; kind: AxisKind } {
  const u = (unit ?? '').trim().toLowerCase().replace('µ', 'u').replace('μ', 'u')
  if (u === 'nm' || u === 'nanometer' || u === 'nanometers') return { unit: 'nm', kind: 'wavelength' }
  if (u === 'um' || u === 'micrometer' || u === 'micrometers') return { unit: 'um', kind: 'wavelength' }
  if (u === 'cm-1' || u === 'cm^-1' || u === '1/cm' || u === 'cm⁻¹') return { unit: 'cm-1', kind: 'wavenumber' }
  return { unit: null, kind: 'feature_index' }
}

/** The envelope axis: recorded values and unit when both are known, else feature indices + null unit. */
export function resolveExplainAxis(axis: ExplainAxis | null | undefined, nFeatures: number): ExplanationV1['axis'] {
  const known = axis && axis.values.length === nFeatures && axis.values.every(Number.isFinite) ? axisKindOf(axis.unit) : null
  if (!axis || !known || known.kind === 'feature_index') {
    return { values: Array.from({ length: nFeatures }, (_, i) => i), unit: null, kind: 'feature_index' }
  }
  return { values: [...axis.values], unit: known.unit, kind: known.kind }
}

/**
 * Map inclusive axis ranges to disjoint, nonempty half-open feature ranges (ascending
 * axis or descending axis). An overlapping range is clipped to start after the previous
 * one; a range left empty is dropped. Returns the kept ranges with their labels.
 */
export function axisRangesToFeatureRanges(
  axisValues: readonly number[],
  ranges: readonly { label: string; axisStart: number; axisEnd: number }[],
): { start: number; end: number; label: string }[] {
  const mapped = ranges.flatMap((r) => {
    const lo = Math.min(r.axisStart, r.axisEnd)
    const hi = Math.max(r.axisStart, r.axisEnd)
    let start = -1
    let end = -1
    axisValues.forEach((v, j) => {
      if (v >= lo && v <= hi) {
        if (start < 0) start = j
        end = j + 1
      }
    })
    return start < 0 ? [] : [{ start, end, label: r.label }]
  }).sort((a, b) => a.start - b.start || a.end - b.end)
  const kept: { start: number; end: number; label: string }[] = []
  for (const r of mapped) {
    const start = Math.max(r.start, kept.at(-1)?.end ?? 0)
    if (start < r.end) kept.push({ start, end: r.end, label: r.label })
  }
  return kept
}

const fmtAxis = (v: number): string => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6))))

/** Build the Methods grouping and the envelope group descriptors. */
export function buildGrouping(
  binding: Pick<ExplainBinding, 'groupsFixedWidth' | 'groupsFromRanges'>,
  grouping: ExplainGrouping,
  axis: ExplanationV1['axis'],
  nFeatures: number,
): { grouping: FeatureGrouping; groups: ExplanationGroup[] } {
  const describe = (start: number, end: number, source: ExplanationGroupSource, label?: string): ExplanationGroup => {
    const a = axis.values[start]
    const b = axis.values[end - 1]
    const auto = axis.kind === 'feature_index'
      ? (end - start === 1 ? `#${start}` : `#${start}–${end - 1}`)
      : (end - start === 1 ? fmtAxis(a) : `${fmtAxis(a)}–${fmtAxis(b)}`)
    return { label: label ?? auto, feature_start: start, feature_end: end, axis_start: a, axis_end: b, source }
  }
  const contiguousGroups = (fg: FeatureGrouping): { start: number; end: number }[] => {
    const spans: { start: number; end: number }[] = Array.from({ length: fg.nGroups }, () => ({ start: -1, end: -1 }))
    for (let j = 0; j < nFeatures; j++) {
      const g = fg.featureGroup[j]
      const s = spans[g]
      if (s.start < 0) s.start = j
      else if (s.end !== j) throw new Error(`Methods returned a non-contiguous group ${g}.`)
      s.end = j + 1
    }
    return spans
  }
  if (grouping.kind === 'per_feature') {
    return {
      grouping: { featureGroup: Int32Array.from({ length: nFeatures }, (_, j) => j), nGroups: nFeatures },
      groups: Array.from({ length: nFeatures }, (_, j) => describe(j, j + 1, 'per_feature')),
    }
  }
  if (grouping.kind === 'fixed_width') {
    const fg = binding.groupsFixedWidth(nFeatures, grouping.width)
    return { grouping: fg, groups: contiguousGroups(fg).map((s) => describe(s.start, s.end, 'fixed_width')) }
  }
  const ranges = axisRangesToFeatureRanges(axis.values, grouping.ranges)
  if (ranges.length === 0) invalid('No band falls inside this spectral range.', 'Use fixed-width groups.')
  const fg = binding.groupsFromRanges(nFeatures, ranges.map((r) => [r.start, r.end] as const))
  const spans = contiguousGroups(fg)
  return {
    grouping: fg,
    groups: spans.map((s, g) => {
      const r = fg.rangeOfGroup?.[g] ?? -1
      return r >= 0 ? describe(s.start, s.end, 'ranges', ranges[r].label) : describe(s.start, s.end, 'remainder')
    }),
  }
}

const nest3 = (a: Float64Array, d1: number, d2: number, d3: number): number[][][] =>
  Array.from({ length: d1 }, (_, i) => Array.from({ length: d2 }, (_, j) => Array.from(a.subarray((i * d2 + j) * d3, (i * d2 + j + 1) * d3))))
const nest2 = (a: Float64Array, d1: number, d2: number): number[][] =>
  Array.from({ length: d1 }, (_, i) => Array.from(a.subarray(i * d2, (i + 1) * d2)))

export interface EnvelopeContext {
  axis: ExplanationV1['axis']
  groups: ExplanationGroup[]
  featureNames: string[] | null
  sampleIndices: number[]
  rowSource: ExplainRows['source']
  outputIndex: number
  outputLabel: string | null
  summary: { meanAbs: Float64Array; meanSigned: Float64Array }
  settings: Record<string, number | string | boolean | null>
}

/** Wrap a Methods AttributionResult in the `nirs4all.explanation.v1` envelope. */
export function buildExplanationEnvelope(result: AttributionResult, ctx: EnvelopeContext): ExplanationV1 {
  if (ctx.sampleIndices.length !== result.nRows) throw new Error('Explained rows and their source indices differ in count.')
  if (ctx.groups.length !== result.nGroups) throw new Error('Explanation groups and attribution groups differ in count.')
  const { nRows, nGroups, nOutputs } = result
  return {
    schema: 'nirs4all.explanation.v1',
    kind: result.kind,
    engine: { ...result.engine },
    exactness: result.exactness,
    additive: result.additive,
    group_aggregation: result.groupAggregation,
    attribution_space: 'raw_input',
    output: { index: ctx.outputIndex, label: ctx.outputLabel, space: 'target' },
    axis: ctx.axis,
    feature_names: ctx.featureNames,
    groups: ctx.groups,
    rows: { count: nRows, sample_indices: [...ctx.sampleIndices], source: ctx.rowSource },
    attributions: nest3(result.attributions, nRows, nGroups, nOutputs),
    std_error: result.stdError ? nest3(result.stdError, nRows, nGroups, nOutputs) : null,
    expected_value: nest2(result.expected, nRows, nOutputs),
    prediction: nest2(result.predictions, nRows, nOutputs),
    additivity_max_abs_error: result.additivityMaxAbsError,
    settings: { ...result.settings, ...ctx.settings },
    summary: { output_index: ctx.outputIndex, mean_abs: Array.from(ctx.summary.meanAbs), mean_signed: Array.from(ctx.summary.meanSigned) },
  }
}

/**
 * Run one explanation: validate, subsample rows and background by seed, build groups,
 * call Methods `explainModel` with `predictMatrix` as its batch predictor, and build the
 * envelope. All prediction columns are explained; `outputIndex` selects the summarized one.
 */
export async function runExplain(
  req: ExplainRequest,
  binding: ExplainBinding,
  predictMatrix: PredictMatrixFn,
  opts: ExplainOptions = {},
): Promise<ExplainResponse> {
  const s = validateExplainRequest(req)
  const p = req.nFeatures
  const axis = resolveExplainAxis(req.axis, p)
  const { grouping, groups } = buildGrouping(binding, s.grouping, axis, p)
  if (s.method === 'exact_shap' && groups.length > EXACT_SHAP_MAX_GROUPS) {
    invalid(`Exact SHAP enumerates 2^G coalitions and is limited to ${EXACT_SHAP_MAX_GROUPS} groups (this grouping has ${groups.length}).`, 'Use wider groups or permutation SHAP.')
  }
  const explained = takeRows(req.rows, seededSubsample(req.rows.nRows, s.maxRows, s.seed), p)
  const background = takeRows(req.background, seededSubsample(req.background.nRows, s.maxBackground, s.seed + 1), p)
  let nOutputs: number | null = null
  const predictBatch = async (rows: Float64Array, nRows: number, nFeatures: number): Promise<Float64Array> => {
    const pred = await predictMatrix(rows, nRows, nFeatures)
    if (pred.rows !== nRows || pred.data.length !== nRows * pred.cols || pred.cols < 1) {
      throw new Error(`The model returned ${pred.rows} x ${pred.cols} predictions for ${nRows} rows.`)
    }
    if (nOutputs === null) {
      nOutputs = pred.cols
      if (s.outputIndex >= nOutputs) invalid(`Output index ${s.outputIndex} is outside the model's ${nOutputs} outputs.`)
    } else if (pred.cols !== nOutputs) {
      throw new Error('The model changed its output width between prediction batches.')
    }
    return pred.data
  }
  const nExplained = explained.sourceIndices.length
  const nBackground = background.sourceIndices.length
  const result = await binding.explainModel({
    X: { data: explained.X, rows: nExplained, cols: p },
    ...(nBackground > 0 && s.baseline !== 'interpolate' ? { background: { data: background.X, rows: nBackground, cols: p } } : {}),
    grouping,
    predictBatch,
    options: { method: s.method, baseline: s.baseline, nPermutations: s.nPermutations, seed: s.seed },
    onProgress: opts.onProgress ? (done, total) => opts.onProgress?.({ done, total }) : undefined,
    signal: opts.signal,
  })
  if (s.outputIndex >= result.nOutputs) invalid(`Output index ${s.outputIndex} is outside the model's ${result.nOutputs} outputs.`)
  const summary = binding.summarizeAttributions(result, s.outputIndex)
  const envelope = buildExplanationEnvelope(result, {
    axis,
    groups,
    featureNames: req.model.features?.names ?? req.featureNames ?? null,
    sampleIndices: explained.sourceIndices,
    rowSource: req.rows.source,
    outputIndex: s.outputIndex,
    outputLabel: req.outputLabel ?? null,
    summary,
    settings: {
      baseline: s.baseline,
      n_background: s.baseline === 'interpolate' ? 0 : nBackground,
      background_source: req.background.source,
      n_permutations: s.nPermutations,
      seed: s.seed,
      grouping: s.grouping.kind,
      group_width: s.grouping.kind === 'fixed_width' ? s.grouping.width : null,
      group_ranges_source: s.grouping.kind === 'ranges' ? s.grouping.source ?? null : null,
      max_rows: s.maxRows,
      n_candidate_rows: req.rows.nRows,
      evaluations: result.evaluations,
    },
  })
  return { envelope, explainedX: explained.X, evaluations: result.evaluations }
}
