import { useMemo } from 'react'
import { RuntimeDiagnosticList } from 'nirs4all-ui/components'
import type { MaterializedDataset, RunResult, ScoreNode } from '@/engine/types'
import { inspectorResults, scoreEvaluationLabel, selectionValidation } from './inspectorAdapter'

/** Scientific notices shared by the step page and the dedicated Inspector. */
export function ResultsNotices({ runs, dataset, datasetName, warnings: suppliedWarnings }: {
  runs: RunResult[]
  dataset: MaterializedDataset | null
  datasetName: string
  warnings?: readonly string[]
}) {
  const warnings = useMemo(() => suppliedWarnings ?? inspectorResults(runs, dataset, datasetName).warnings, [runs, dataset, datasetName, suppliedWarnings])
  return <div className="space-y-2 text-sm" data-results-notices>
    <p className="text-muted-foreground">
      CV and single-holdout validation scores come from the owner and are used for selection; they are not independent-test scores. Held-out test scores are final evaluation.
      {' '}Training resubstitution scores are hidden until explicitly requested. Missing metrics are not computed here.
    </p>
    {warnings.map((warning) => <p key={warning} role="status">{warning}</p>)}
    {runs.map((run) => <div key={run.id}>
      <RuntimeDiagnosticList source={{ diagnostics: run.diagnostics }} className="mb-2 text-sm" />
      {selectionValidation(run) && <details>
        <summary>Selection validation — owner reports and chain issues</summary>
        <p>Selection validation is not independent-test evaluation. Undefined metrics retain the owner's reasons.</p>
        <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(run.refit.scoreContext, null, 2)}</pre>
        <pre className="overflow-auto whitespace-pre-wrap">{typeof run.bundleJson === 'string' ? run.bundleJson : JSON.stringify(run.bundleJson, null, 2)}</pre>
      </details>}
      {run.missingTargets ? <p role="status">{run.pipelineName}: {run.missingTargets} without target excluded</p> : null}
    </div>)}
  </div>
}

export function ScoreContextCaption({ run, score }: { run: RunResult; score: ScoreNode }) {
  const context = score.scoreContext
  return <div className="my-3 space-y-1 text-sm text-muted-foreground" data-score-context>
    <p>{scoreEvaluationLabel(run, score)}{context?.independent_test === false ? ' · not independent-test evaluation' : ''}.
      {context ? ` Scored unit: ${context.unit === 'sample' ? 'physical sample' : 'observation (scan)'}. ${context.nObservations} observations; ${context.nPhysicalSamples ?? 'unknown'} physical samples. Aggregation: ${context.aggregation}. Identity: ${context.identityBasis}; physical key: ${context.physicalKey}.` : ' The owner did not supply a detailed scoring context.'}
    </p>
    {context?.rawObservationMetrics === 'not-computed' && <p>Raw observation metrics were not computed by the owner.</p>}
    {Object.entries(context?.undefined_metrics ?? {}).map(([metric, reason]) => <p key={metric}>{metric}: — ({reason})</p>)}
    {context && <details><summary>Exact owner scoring context</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(context, null, 2)}</pre></details>}
  </div>
}

export function OwnerPredictionRows({ score }: { score: ScoreNode }) {
  return <details className="mt-4 rounded border border-border p-3">
    <summary className="cursor-pointer text-sm font-medium">Selected owner score: {score.name} — prediction rows</summary>
    <p className="my-2 text-sm">{score.predictions.length} owner predictions. Actual and predicted values define the parity axes; residuals define the residual chart's vertical axis. Repeated sample IDs remain separate. Undefined values are shown as —.</p>
    <div role="region" aria-label="Selected owner predictions" tabIndex={0} className="mt-3 max-h-96 overflow-auto">
      <table className="w-full text-sm">
        <caption>{score.name}: all owner prediction rows; repeated sample IDs remain separate.</caption>
        <thead><tr><th scope="col">Sample ID</th><th scope="col">Actual</th><th scope="col">Predicted</th><th scope="col">Residual</th></tr></thead>
        <tbody>{score.predictions.map((row, index) => <tr key={index}>
          <th scope="row">{row.sampleId}</th><td>{row.actualLabel ?? displayNumber(row.actual)}</td><td>{row.predictedLabel ?? displayNumber(row.predicted)}</td><td>{displayNumber(row.residual)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </details>
}

const displayNumber = (value: number) => Number.isFinite(value) ? String(value) : '—'
