import type { PipelineDSL, RunResult } from '@/engine/types'
import { buildN4aBundle, serializeTyped } from './n4a'

function save(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadJson(filename: string, obj: unknown): void {
  save(filename, JSON.stringify(obj, null, 2), 'application/json')
}

export function downloadPipeline(dsl: PipelineDSL): void {
  downloadJson(`${slug(dsl.name)}.pipeline.json`, dsl)
}

/** Export a run: metrics summary + per-sample predictions as CSV + the bundle JSON. */
export function downloadRunCsv(run: RunResult): void {
  const rows = [['scope', 'sampleId', 'actual', 'predicted', 'residual']]
  const push = (scope: string, preds: RunResult['refit']['predictions']) => {
    for (const p of preds) rows.push([scope, p.sampleId, String(p.actual), String(p.predicted), String(p.residual)])
  }
  push('refit', run.refit.predictions)
  if (run.cv) push('cv', run.cv.predictions) // refit-only run has no CV predictions
  save(`${slug(run.pipelineName)}.predictions.csv`, rows.map((r) => r.join(',')).join('\n'), 'text/csv')
}

export function downloadRunJson(run: RunResult): void {
  // strip the (large, non-portable) fitted model state from the exported bundle
  const { model, ...rest } = run
  downloadJson(`${slug(run.pipelineName)}.results.json`, { ...rest, modelSummary: { engine: model.dsl ? run.engine : run.engine, nFeatures: model.nFeatures } })
}

/** Export a re-importable .n4a model bundle (pipeline + fitted model + metadata). */
export function downloadN4a(run: RunResult): void {
  save(`${slug(run.pipelineName)}.n4a`, serializeTyped(buildN4aBundle(run)), 'application/json')
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nirs4all-web'
}
