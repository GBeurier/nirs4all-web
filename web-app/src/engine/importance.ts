// Model-intrinsic importance host adapter: rebuilds the fitted native pipeline from its
// N4ME states and asks Methods for coefficients, VIP, selectivity ratio and latent
// weights/loadings (model-input space), and for the exact raw-input coefficients of an
// affine pipeline. It also aggregates and compares profiles and previews baselines.
// Every number is computed by Methods; this module selects rows, wraps arrays in the
// `nirs4all.importance_profile.v1` envelope and reports refusals in the user's terms.
import type { FeatureGrouping, Matrix, NativeEstimator, RolePipeline } from './wasm/methods/index.js'
import { buildGrouping, explainRefusal, resolveExplainAxis, seededSubsample, takeRows, type ExplainBinding, type RawAffineMap } from './explain'
import { isNativeModelState, loadEstimator, rebuildRolePipeline, type NativeModelState } from './methods/n4m'
import type { FittedState } from './orchestrate'
import type {
  BaselinePreviewRequest,
  BaselinePreviewResponse,
  CompareProfilesRequest,
  CompareProfilesResponse,
  FittedPipeline,
  ImportanceKind,
  ImportancePipelineStep,
  ImportanceProfileV1,
  ImportanceRefusal,
  ImportanceRequest,
  ImportanceResponse,
  ImportanceSpace,
} from './types'

/** Latent decomposition of a fitted PLS-family model (Methods `latentStructure`). */
export interface LatentStructure {
  nComponents: number
  xWeights: Matrix
  xLoadings: Matrix
}
/** The Methods surface this adapter uses (CONTRACTS §1 of the 2026-11-18 batch). */
export interface ImportanceBinding extends Pick<ExplainBinding, 'groupsFixedWidth' | 'groupsFromRanges' | 'perturbRows'> {
  version(): string
  modelImportance(est: NativeEstimator, X: Matrix, opts: { kind: 'vip' | 'selectivity_ratio' | 'standardized_coefficients'; outputIndex?: number }): Float64Array
  aggregateProfile(values: Float64Array, grouping: FeatureGrouping, rule: 'sum' | 'mean' | 'sum_abs' | 'mean_abs' | 'max_abs'): Float64Array
  compareProfiles(profiles: Matrix, opts?: { topK?: number }): { spearman: Matrix; topKJaccard: Matrix }
}
type IntrospectableEstimator = NativeEstimator & {
  affineCoefficients(): RawAffineMap
  latentStructure(): LatentStructure
}
type IntrospectablePipeline = RolePipeline & {
  inputAffineCoefficients(): RawAffineMap & { nFeaturesIn: number }
  stepsInfo(): { methodId?: string; role?: string; affine?: boolean; columnAligned?: boolean }[]
}

/** The latent components reported by default (weights/loadings), at most. */
export const MAX_REPORTED_COMPONENTS = 10

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** The native pieces of an in-session libn4m pipeline, or the reason there are none. */
export function nativePipelineParts(model: FittedPipeline):
  | { ok: true; steps: { type: string; params: Record<string, unknown>; n4me: Uint8Array }[]; modelType: string; modelState: NativeModelState & { fitParams: Record<string, unknown> } }
  | { ok: false; reason: string } {
  const st = model.state as Partial<FittedState> | null
  if (!st || !Array.isArray(st.chain) || st.backendId !== 'libn4m-wasm') {
    return { ok: false, reason: 'Model-intrinsic importances need a pipeline fitted in this session by the native libn4m backend (imported archives and JavaScript-backend models keep no inspectable native model).' }
  }
  if (st.branch && st.branch.length >= 2) return { ok: false, reason: 'A feature-union pipeline concatenates branches before the model, so its coefficients do not map onto one spectral axis.' }
  if (!model.dsl.model || !isNativeModelState(st.model) || !st.model.fitParams) return { ok: false, reason: 'The fitted model is not a native libn4m estimator state.' }
  const replayed = st.chain.filter((s) => s.state !== null)
  if (!replayed.every((s) => s.state instanceof Uint8Array)) return { ok: false, reason: 'A preprocessing step is not a native libn4m state.' }
  return {
    ok: true,
    steps: replayed.map((s) => ({ type: s.type, params: s.params, n4me: s.state as Uint8Array })),
    modelType: model.dsl.model.type,
    modelState: { ...st.model, fitParams: st.model.fitParams },
  }
}

/** Raw-input affine map of the complete pipeline, or a typed refusal naming the first non-affine step. */
export function rawAffineCoefficients(model: FittedPipeline, featureNames?: string[]): RawAffineMap {
  const parts = nativePipelineParts(model)
  if (!parts.ok) throw explainRefusal(parts.reason, 'Use permutation SHAP or the local gradient explainer.', 'raw_affine_coefficients')
  const pipeline = rebuildRolePipeline(parts.steps, { type: parts.modelType, state: parts.modelState }, model.features?.names ?? featureNames) as IntrospectablePipeline
  try {
    return pipeline.inputAffineCoefficients()
  } catch (e) {
    throw explainRefusal(`Linear SHAP needs an affine pipeline: ${message(e)}`, 'Use the local gradient explainer, which linearizes the pipeline around each spectrum.', 'raw_affine_coefficients')
  } finally {
    pipeline.dispose()
  }
}

/**
 * JSON cannot carry ±∞: a non-finite value becomes a gap (NaN in memory, null in JSON) and
 * the envelope records how many there are and what they mean. Methods reports +∞ for a
 * selectivity ratio whose column the target-predictive component reconstructs exactly.
 */
function withFiniteValues(p: ImportanceProfileV1, kind: ImportanceKind): ImportanceProfileV1 {
  const bad = p.values.filter((v) => !Number.isFinite(v)).length
  if (bad === 0) return p
  return {
    ...p,
    values: p.values.map((v) => (Number.isFinite(v) ? v : Number.NaN)),
    settings: {
      ...p.settings,
      non_finite_values: bad,
      non_finite_meaning: kind === 'selectivity_ratio'
        ? '+inf: the column is reproduced exactly by the target-predictive component (no residual); shown as a gap'
        : 'not a finite number; shown as a gap',
    },
  }
}

/** Preprocessing affinity of a native pipeline (steps and model), or null when it has no native parts. */
export function describePipeline(model: FittedPipeline, featureNames?: string[]): ImportanceProfileV1['preprocessing'] | null {
  const parts = nativePipelineParts(model)
  if (!parts.ok) return null
  const pipeline = rebuildRolePipeline(parts.steps, { type: parts.modelType, state: parts.modelState }, model.features?.names ?? featureNames) as IntrospectablePipeline
  const est = loadEstimator(parts.modelState.n4me) as IntrospectableEstimator
  try {
    const info = pipeline.stepsInfo()
    let modelAffine = true
    try {
      est.affineCoefficients()
    } catch {
      modelAffine = false
    }
    return {
      steps: parts.steps.map((s) => s.type),
      affine: modelAffine && parts.steps.every((_, i) => info[i]?.affine === true),
      column_aligned: parts.steps.every((_, i) => info[i]?.columnAligned === true),
    }
  } finally {
    est.dispose()
    pipeline.dispose()
  }
}

const column = (m: Matrix, j: number): number[] => Array.from({ length: m.rows }, (_, i) => m.data[i * m.cols + j])

/** Compute every applicable model-intrinsic profile of a native pipeline. */
export function computeImportance(req: ImportanceRequest, binding: ImportanceBinding): ImportanceResponse {
  const parts = nativePipelineParts(req.model)
  if (!parts.ok) throw explainRefusal(parts.reason, 'Use the model-agnostic explainers (SHAP, occlusion, local gradient).', 'model_intrinsic_importance')
  if (req.model.taskType !== 'regression') {
    throw explainRefusal('Model-intrinsic importances are reported for regression models only.', 'Explain a regression model.', 'class_probability_output')
  }
  const p = req.nFeatures
  if (req.statRows.nRows < 2 || req.statRows.X.length !== req.statRows.nRows * p) {
    throw explainRefusal('Model-intrinsic importances need at least two rows to compute model-space statistics.', 'Load the training dataset or score a file in Predict.')
  }
  const out = req.outputIndex ?? 0
  const outputLabel = req.outputLabel ?? null
  const rawAxis = resolveExplainAxis(req.axis, p)
  const engine = { name: 'nirs4all-methods', version: binding.version() }
  const refusals: ImportanceRefusal[] = []
  const profiles: ImportanceProfileV1[] = []
  const pipeline = rebuildRolePipeline(parts.steps, { type: parts.modelType, state: parts.modelState }, req.model.features?.names ?? req.featureNames) as IntrospectablePipeline
  const est = loadEstimator(parts.modelState.n4me) as IntrospectableEstimator
  try {
    const info = pipeline.stepsInfo()
    // The last step is the model; every earlier stateful step is a transform/selector.
    const steps: ImportancePipelineStep[] = parts.steps.map((s, i) => ({ type: s.type, affine: info[i]?.affine === true, columnAligned: info[i]?.columnAligned === true }))
    const affine = steps.every((s) => s.affine)
    const columnAligned = steps.every((s) => s.columnAligned)
    const firstNonAffineStep = steps.find((s) => !s.affine)?.type ?? null
    const Xm = pipeline.transform({ data: req.statRows.X, rows: req.statRows.nRows, cols: p }, req.model.features ? req.featureNames ?? req.model.features.names : undefined)
    const modelAxisAligned = columnAligned && Xm.cols === p
    const modelAxis: ImportanceProfileV1['axis'] = modelAxisAligned
      ? { ...rawAxis }
      : { values: Array.from({ length: Xm.cols }, (_, j) => j), unit: null, kind: 'model_feature' }
    const rows = { count: req.statRows.nRows, source: req.statRows.source }
    const base = (kind: ImportanceKind, space: ImportanceSpace, values: number[], extra: Partial<ImportanceProfileV1> = {}): ImportanceProfileV1 => withFiniteValues({
      schema: 'nirs4all.importance_profile.v1',
      kind,
      scope: 'global',
      space,
      exactness: 'exact',
      signed: kind === 'regression_coefficients' || kind === 'standardized_coefficients' || kind === 'x_weights' || kind === 'x_loadings',
      component: null,
      output: { index: out, label: outputLabel, space: 'target' },
      axis: space === 'raw_input' ? { ...rawAxis } : modelAxis,
      values,
      rows: kind === 'vip' || kind === 'selectivity_ratio' || kind === 'standardized_coefficients' ? rows : null,
      model: { method_id: parts.modelType, n_components: null },
      preprocessing: { steps: steps.map((s) => s.type), affine, column_aligned: columnAligned },
      engine,
      settings: {},
      ...extra,
    }, kind)
    const refuse = (kind: ImportanceRefusal['kind'], space: ImportanceSpace, reason: string) => refusals.push({ kind, space, reason })

    let coefficients: RawAffineMap | null = null
    try {
      coefficients = est.affineCoefficients()
    } catch (e) {
      refuse('regression_coefficients', 'model_input', `The model is not affine (${message(e)}); it has no regression coefficients.`)
    }
    if (coefficients) {
      if (out >= coefficients.coefficients.cols) throw explainRefusal(`Output index ${out} is outside the model's ${coefficients.coefficients.cols} outputs.`, 'Select an existing target.')
      profiles.push(base('regression_coefficients', 'model_input', column(coefficients.coefficients, out)))
      profiles.push(base('standardized_coefficients', 'model_input', Array.from(binding.modelImportance(est, Xm, { kind: 'standardized_coefficients', outputIndex: out }))))
      try {
        const raw = pipeline.inputAffineCoefficients()
        profiles.push(base('regression_coefficients', 'raw_input', column(raw.coefficients, out)))
      } catch (e) {
        refuse('regression_coefficients', 'raw_input', `${firstNonAffineStep ? `"${firstNonAffineStep}" is not affine` : 'The pipeline is not affine'}, so the coefficients have no exact raw-spectrum equivalent (${message(e)}). The local gradient explainer gives the mean local raw-space coefficient instead.`)
      }
    }

    let latent: LatentStructure | null = null
    try {
      latent = est.latentStructure()
    } catch (e) {
      refuse('vip', 'model_input', `The model has no latent components (${message(e)}): VIP, selectivity ratio and component weights are PLS-family diagnostics.`)
    }
    if (latent) {
      const nComp = latent.nComponents
      const latentModel = { method_id: parts.modelType, n_components: nComp }
      profiles.push(base('vip', 'model_input', Array.from(binding.modelImportance(est, Xm, { kind: 'vip' })), { model: latentModel }))
      try {
        profiles.push(base('selectivity_ratio', 'model_input', Array.from(binding.modelImportance(est, Xm, { kind: 'selectivity_ratio', outputIndex: out })), { model: latentModel }))
      } catch (e) {
        refuse('selectivity_ratio', 'model_input', message(e))
      }
      const shown = Math.min(nComp, req.maxComponents ?? MAX_REPORTED_COMPONENTS)
      for (let a = 0; a < shown; a++) {
        profiles.push(base('x_weights', 'model_input', column(latent.xWeights, a), { component: a, model: latentModel }))
        profiles.push(base('x_loadings', 'model_input', column(latent.xLoadings, a), { component: a, model: latentModel }))
      }
    }
    return { profiles, pipeline: { steps, affine, columnAligned, firstNonAffineStep, modelAffine: coefficients !== null }, refusals }
  } finally {
    est.dispose()
    pipeline.dispose()
  }
}

const nested = (m: Matrix): (number | null)[][] =>
  Array.from({ length: m.rows }, (_, i) => Array.from(m.data.subarray(i * m.cols, (i + 1) * m.cols), (v) => (Number.isFinite(v) ? v : null)))

/** Aggregate feature-level profiles onto the shared grouping (Methods) and compare them. */
export function compareImportanceProfiles(req: CompareProfilesRequest, binding: ImportanceBinding): CompareProfilesResponse {
  const p = req.nFeatures
  if (req.profiles.length < 2) throw explainRefusal('Comparing needs at least two profiles.', 'Select two or more results.')
  const axis = resolveExplainAxis(req.axis, p)
  const { grouping, groups } = buildGrouping(binding, req.grouping, axis, p)
  const G = groups.length
  const aggregated = req.profiles.map((prof) => {
    if (prof.resolution === 'group') {
      if (prof.values.length !== G) throw explainRefusal(`"${prof.label}" was computed on ${prof.values.length} groups, not the ${G} groups compared.`, 'Compare results that share one grouping.')
      return prof.values
    }
    if (prof.values.length !== p) throw explainRefusal(`"${prof.label}" has ${prof.values.length} values for ${p} spectral features.`, 'Compare raw-axis profiles only.')
    return Array.from(binding.aggregateProfile(Float64Array.from(prof.values), grouping, prof.rule ?? 'mean_abs'))
  })
  const topK = Math.max(1, Math.min(req.topK ?? 10, G))
  const m = aggregated.length
  const data = new Float64Array(m * G)
  aggregated.forEach((row, i) => data.set(row, i * G))
  const cmp = binding.compareProfiles({ data, rows: m, cols: G }, { topK })
  return { groups, aggregated, spearman: nested(cmp.spearman), topKJaccard: nested(cmp.topKJaccard), topK }
}

/** The perturbed rows the explainer would evaluate for one coalition (Methods `perturbRows`). */
export function previewBaseline(req: BaselinePreviewRequest, binding: ImportanceBinding): BaselinePreviewResponse {
  const p = req.nFeatures
  if (req.row.length !== p) throw explainRefusal('The preview row does not match the model width.', 'Select a row of the explained source.')
  const axis = resolveExplainAxis(req.axis, p)
  const { grouping, groups } = buildGrouping(binding, req.grouping, axis, p)
  const bg = req.baseline === 'interpolate' || req.background.nRows < 1
    ? null
    : takeRows(req.background, seededSubsample(req.background.nRows, req.maxBackground ?? 20, (req.seed ?? 0) + 1), p)
  const absent = req.absentGroups.filter((g) => Number.isSafeInteger(g) && g >= 0 && g < groups.length)
  const m = binding.perturbRows({
    X: { data: req.row, rows: 1, cols: p },
    ...(bg ? { background: { data: bg.X, rows: bg.sourceIndices.length, cols: p } } : {}),
    grouping,
    absentGroups: absent,
    baseline: req.baseline,
  })
  return { groups, rows: Float64Array.from(m.data), nRows: m.rows }
}
