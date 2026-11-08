import { useMemo, useState } from 'react'
import { Inspector, type InspectorViewId } from 'nirs4all-ui/inspector'
import { RuntimeDiagnosticList } from 'nirs4all-ui/components'
import 'nirs4all-ui/assets/workbench.css'
import type { MaterializedDataset } from '@/engine/types'
import type { ResultsListProps } from '@/components/contracts'
import { ResultsList } from './ResultsList'
import { inspectorResults } from './inspectorAdapter'

const VIEWS: readonly InspectorViewId[] = [
  'top', 'landscape', 'heatmap', 'compare', 'generalization', 'parity', 'residuals', 'folds', 'hyperparams', 'confusion', 'table',
]

export function ResultsWorkbench(props: ResultsListProps & { dataset: MaterializedDataset | null; datasetName: string }) {
  const { runs, dataset, datasetName } = props
  const data = useMemo(() => inspectorResults(runs, dataset, datasetName), [runs, dataset, datasetName])
  const [showResubstitution, setShowResubstitution] = useState(false)
  const [chosenRef, setChosenRef] = useState<string | null>(null)
  const scoreRefs = data.scoreRefs.filter((ref) => showResubstitution || ref.protocol !== 'refit-resubstitution')
  const scoreRef = scoreRefs.some((ref) => ref.key === chosenRef) ? chosenRef! : data.defaultScoreRef ?? scoreRefs[0]?.key ?? ''
  const selectedRun = runs.find((run) => run.id === props.selectedRunId)
  const selectedScore = selectedRun && [selectedRun.refit, selectedRun.cv, ...selectedRun.folds].find((score) => score?.id === props.selectedScoreId)
  const compare = data.defaultCompare.filter((id) => data.chainRuns.get(id)?.id === props.selectedRunId)
  const availableViews = data.sampleLinking ? [...VIEWS, 'agreement', 'samples'] as const : VIEWS
  return (
    <section aria-label="Owner results Inspector" data-owner-inspector>
      <p className="mb-3 text-sm text-muted-foreground">
        CV validation scores come from the owner and are used for selection. Held-out test scores are final evaluation.
        {' '}Training resubstitution scores are hidden until explicitly requested. Missing metrics are not computed here.
      </p>
      {data.warnings.map((warning) => <p key={warning} role="status" className="mb-2 text-sm">{warning}</p>)}
      {runs.map((run) => <div key={run.id}>
        <RuntimeDiagnosticList source={{ diagnostics: run.diagnostics }} className="mb-2 text-sm" />
        {run.missingTargets ? <p role="status" className="text-sm">{run.pipelineName}: {run.missingTargets} without target excluded</p> : null}
      </div>)}
      {data.scoreRefs.some((ref) => ref.protocol === 'refit-resubstitution') && <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showResubstitution} onChange={(event) => { setShowResubstitution(event.target.checked); setChosenRef(null) }} />
        Show training resubstitution scores (training evaluation only)
      </label>}
      {scoreRefs.length > 0 && <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        Evaluation score
        <select value={scoreRef} onChange={(event) => setChosenRef(event.target.value)} className="rounded border border-border bg-background px-2 py-1">
          {scoreRefs.map((ref) => <option key={ref.key} value={ref.key}>{ref.label}</option>)}
        </select>
      </label>}
      {/* Keep the exact context even if its owner CV metrics are all null. */}
      <Inspector
        key={dataset ? datasetName : 'imported-results'}
        chains={data.chains}
        scoreRefs={scoreRefs.filter((ref) => ref.key === scoreRef)}
        scoreRef={scoreRef}
        onScoreRefChange={setChosenRef}
        predictions={data.predictions}
        unavailablePredictions={data.unavailablePredictions}
        defaultCompare={compare.length > 0 ? compare : data.defaultCompare.slice(0, 1)}
        availableViews={availableViews}
        localStatistics={false}
        defaultLayout={{ preset: 'grid', views: ['top', data.chains.every((chain) => chain.task === 'classification') ? 'confusion' : 'parity', 'table'], maximized: null }}
        onSelectionChange={(ids) => {
          const run = ids[0] && data.chainRuns.get(ids[0])
          if (run) props.onSelect(run, run.cv ?? run.refit)
        }}
        sourceSlot={<ResultsList {...props} />}
      />
      {selectedRun && selectedScore && <details className="mt-4 rounded border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Selected owner score: {selectedScore.name} — prediction rows</summary>
        <p className="my-2 text-sm">{selectedScore.predictions.length} owner predictions. The table retains the selected score context.</p>
        <div role="region" aria-label="Selected owner predictions" tabIndex={0} className="mt-3 overflow-auto">
          <table>
            <caption>{selectedScore.name}: all owner prediction rows; repeated sample IDs remain separate.</caption>
            <thead><tr><th scope="col">Sample ID</th><th scope="col">Actual</th><th scope="col">Predicted</th><th scope="col">Residual</th></tr></thead>
            <tbody>{selectedScore.predictions.map((row, index) => <tr key={index}>
              <th scope="row">{row.sampleId}</th><td>{row.actualLabel ?? String(row.actual)}</td><td>{row.predictedLabel ?? String(row.predicted)}</td><td>{String(row.residual)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
    </section>
  )
}
