// Web runtime-result goldens (B-018).
//
// The Python runtime schema freezes RtResult/RtError as neutral wire envelopes:
// `schema_version` belongs to RtResult, RtError is a detail-free dictionary, and
// fallback is explicit diagnostics/metadata rather than a silent successful run.
// These fixtures lock Web's RunResult projection to those semantics while keeping
// the browser-native RunResult shape unchanged.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isRtErrorException, makeRtError, rtErrorToWire, RtErrorException } from './rt'
import { runResultToRtResultEnvelope, type RtResultWire } from './rt-result'
import type { FittedPipeline, PipelineDSL, PredRow, RunResult, ScoreNode } from './types'

const PLAN_ID = 'plan:web-rt-golden'

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/runtime/${name}`, import.meta.url), 'utf8'))
}

function findSibling(rel: string): string | null {
  let dir = process.cwd()
  for (;;) {
    const candidate = path.join(dir, rel)
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function readSiblingJson(rel: string): Record<string, any> | null {
  const found = findSibling(rel)
  return found ? JSON.parse(readFileSync(found, 'utf8')) : null
}

const row = (sampleId: string, value: number): PredRow => ({
  sampleId,
  actual: value,
  predicted: value,
  residual: 0,
})

const score = (id: string, name: string, kind: ScoreNode['kind'], rows: PredRow[]): ScoreNode => ({
  id,
  name,
  kind,
  metrics: { rmse: 0, r2: 1, mae: 0, n: rows.length },
  predictions: rows,
  status: 'completed',
})

const dsl: PipelineDSL = {
  name: 'rt-golden-pls',
  steps: [],
  model: { id: 'm', type: 'PLS', params: { n_components: 2 } },
  cv: { folds: 2, seed: 7 },
}

const fitted: FittedPipeline = {
  dsl,
  taskType: 'regression',
  nFeatures: 2,
  state: { backendId: 'libn4m-wasm' },
}

const cvRows = [row('s0', 1), row('s1', 2), row('s2', 3), row('s3', 4)]
const fold1Rows = [row('s0', 1), row('s1', 2)]
const fold2Rows = [row('s2', 3), row('s3', 4)]
const refitRows = [row('s4', 5), row('s5', 6)]

function schedulerFallbackRtError() {
  return makeRtError({
    verb: 'run',
    cause: 'runtime_error',
    message: 'execute_campaign_phase_json crashed: scheduler boom',
    mitigation: 'Cross-validation re-ran through the libn4m chain over dag-ml folds; results are valid, but the dag-ml scheduler did not run this phase.',
    detail: 'dag-ml execute_campaign_phase_json failed; degraded to the libn4m fold chain.',
  })
}

function strictRefusalRtError() {
  return makeRtError({
    verb: 'run',
    cause: 'runtime_error',
    message: 'execute_campaign_phase_json crashed: scheduler boom',
    mitigation: 'Set allow_fallback=true to permit a diagnosed libn4m fallback, or keep allow_fallback=false to fail closed.',
    detail: 'strict allowFallback=false refused the scheduler fallback.',
  })
}

function goldenRun(opts: { id: string; schedulerFallback?: boolean; diagnostics?: ReturnType<typeof schedulerFallbackRtError>[] }): RunResult {
  return {
    id: opts.id,
    pipelineName: 'rt-golden-pls',
    taskType: 'regression',
    targetName: 'moisture',
    refit: score('refit', 'Refit test', 'refit', refitRows),
    cv: score('cv', 'CV Scores', 'cv', cvRows),
    folds: [
      score('fold-1', 'Fold 1', 'fold', fold1Rows),
      score('fold-2', 'Fold 2', 'fold', fold2Rows),
    ],
    seed: 7,
    engine: 'dag-ml-wasm + libn4m',
    scoreMetric: 'rmse',
    lineage: {
      engine: 'dag-ml-wasm',
      compiled: true,
      executed: true,
      schedulerFallback: opts.schedulerFallback || undefined,
      phase: 'FIT_CV',
      selectedVariant: 'variant:base',
      variantCount: 1,
      folds: 2,
      version: '0.0.0-test',
      dataProvider: {
        layer: 'dag-ml-data',
        status: 'materialized',
        fingerprints: { schema: 'sch', plan: 'pln', relation: null },
        representation: 'tabular_numeric',
        version: '0.0.0-test',
      },
    },
    model: fitted,
    createdAt: '2026-07-01T00:00:00.000Z',
    variantCount: 1,
    ...(opts.diagnostics?.length ? { diagnostics: opts.diagnostics } : {}),
  }
}

function assertRtErrorWireShape(value: Record<string, unknown>): void {
  const schema = readSiblingJson(path.join('nirs4all-ecosystem', 'docs', 'contracts', 'runtime', 'rt_error.v1.schema.json'))
  if (!schema) return
  const allowed = new Set(Object.keys(schema.properties))
  for (const key of Object.keys(value)) expect(allowed.has(key)).toBe(true)
  for (const key of schema.required as string[]) expect(value[key]).toBeDefined()
  expect(schema.properties.verb.enum).toContain(value.verb)
  expect(schema.properties.cause.enum).toContain(value.cause)
  expect('detail' in value).toBe(false)
  expect('schema_version' in value).toBe(false)
}

function assertRtResultWireShape(value: RtResultWire): void {
  const schema = readSiblingJson(path.join('nirs4all-ecosystem', 'docs', 'contracts', 'runtime', 'rt_result.v1.schema.json'))
  if (schema) {
    const allowed = new Set(Object.keys(schema.properties))
    for (const key of Object.keys(value)) expect(allowed.has(key)).toBe(true)
    for (const key of schema.required as string[]) expect((value as unknown as Record<string, unknown>)[key]).toBeDefined()
    expect(value.schema_version).toBe(1)
    expect(Object.keys(value.manifest).sort()).toEqual(Object.keys(schema.properties.manifest.properties).sort())
  }

  const scoreSchema = readSiblingJson(path.join('dag-ml', 'docs', 'contracts', 'score_set.schema.json'))
  if (scoreSchema) {
    const reportSchema = scoreSchema.$defs.regression_metric_report
    const reportAllowed = new Set(Object.keys(reportSchema.properties))
    for (const report of value.reports) {
      for (const key of Object.keys(report)) expect(reportAllowed.has(key)).toBe(true)
      for (const key of reportSchema.required as string[]) expect((report as unknown as Record<string, unknown>)[key]).toBeDefined()
      expect(reportSchema.properties.partition.enum).toContain(report.partition)
      expect(reportSchema.properties.level.enum).toContain(report.level)
      expect(report.row_count).toBeGreaterThan(0)
      expect(report.target_width).toBeGreaterThan(0)
      for (const metric of Object.values(report.metrics)) expect(Number.isFinite(metric)).toBe(true)
    }
  }

  for (const diagnostic of value.diagnostics ?? []) assertRtErrorWireShape(diagnostic as unknown as Record<string, unknown>)
}

describe('RtResult Web goldens', () => {
  it('projects a clean Web RunResult to the shared RtResult success envelope', () => {
    const envelope = runResultToRtResultEnvelope(goldenRun({ id: 'run:web-rt-success' }), { planId: PLAN_ID })

    expect(envelope).toEqual(readFixture('rt_result.success.v1.json'))
    expect('diagnostics' in envelope).toBe(false)
    expect(envelope.manifest.capabilities).toMatchObject({ allow_fallback: true, scheduler_fallback: false, diagnostics: 0 })
    assertRtResultWireShape(envelope)
  })

  it('projects scheduler fallback metadata and strips RtError detail on the wire', () => {
    const envelope = runResultToRtResultEnvelope(
      goldenRun({
        id: 'run:web-rt-scheduler-fallback',
        schedulerFallback: true,
        diagnostics: [schedulerFallbackRtError()],
      }),
      { planId: PLAN_ID },
    )

    expect(envelope.diagnostics?.[0]).toEqual(readFixture('rt_error.scheduler_fallback.v1.json'))
    expect(envelope).toEqual(readFixture('rt_result.scheduler_fallback.v1.json'))
    expect(envelope.manifest.capabilities).toMatchObject({ allow_fallback: true, scheduler_fallback: true, diagnostics: 1 })
    assertRtResultWireShape(envelope)
  })

  it('locks allowFallback=false refusal to a typed RtError wire payload, not an RtResult', () => {
    const err = new RtErrorException(strictRefusalRtError())
    expect(isRtErrorException(err)).toBe(true)

    const wire = rtErrorToWire(err.rtError)
    expect(wire).toEqual(readFixture('rt_error.strict_scheduler_refusal.v1.json'))
    expect('schema_version' in wire).toBe(false)
    expect('detail' in wire).toBe(false)
    assertRtErrorWireShape(wire as unknown as Record<string, unknown>)
  })
})
