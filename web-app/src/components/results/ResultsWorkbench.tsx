import { useEffect, useMemo, useRef, useState } from 'react'
import { Inspector, type InspectorViewId } from 'nirs4all-ui/inspector'
import 'nirs4all-ui/assets/workbench.css'
import type { MaterializedDataset } from '@/engine/types'
import type { ResultsListProps } from '@/components/contracts'
import { inspectorResults, inspectorScoreRef, scoreForInspectorRef, inspectorPredictionsForScore } from './inspectorAdapter'
import { OwnerPredictionRows, ResultsNotices, ScoreContextCaption } from './ResultsNotices'

const VIEWS: readonly InspectorViewId[] = [
  'top', 'landscape', 'heatmap', 'compare', 'generalization', 'parity', 'residuals', 'folds', 'hyperparams', 'confusion', 'table',
]

export function ResultsWorkbench(props: ResultsListProps & { dataset: MaterializedDataset | null; datasetName: string }) {
  const { runs, dataset, datasetName } = props
  const data = useMemo(() => inspectorResults(runs, dataset, datasetName), [runs, dataset, datasetName])
  const [showResubstitution, setShowResubstitution] = useState(false)
  const [chosenRef, setChosenRef] = useState<string | null>(null)
  const [selection, setSelection] = useState<readonly string[]>([])
  const [compare, setCompare] = useState<readonly string[]>([])
  const selectedRun = runs.find((run) => run.id === props.selectedRunId)
  const selectedScore = selectedRun && [selectedRun.refit, selectedRun.cv, ...selectedRun.folds].find((score) => score?.id === props.selectedScoreId)
  const selectedRef = selectedRun && selectedScore
    ? inspectorScoreRef(selectedRun, selectedScore, data.scoreRefs, data.scoreRefs.find((ref) => ref.key === chosenRef)?.metric)
    : null
  const selectedTraining = Boolean(selectedRef && data.scoreRefs.find((ref) => ref.key === selectedRef)?.protocol === 'refit-resubstitution')
  const trainingVisible = showResubstitution || selectedTraining
  const previousTrainingScore = useRef<string | null>(null)
  useEffect(() => {
    // Revoking the selected training score on Results also revokes its hidden Inspector view.
    if (previousTrainingScore.current && !props.selectedScoreId) {
      setShowResubstitution(false)
      setChosenRef(null)
    }
    previousTrainingScore.current = selectedTraining ? props.selectedScoreId : null
  }, [props.selectedScoreId, selectedTraining])
  const scoreRefs = data.scoreRefs.filter((ref) => trainingVisible || ref.protocol !== 'refit-resubstitution')
  const scoreRef = selectedRef && scoreRefs.some((ref) => ref.key === selectedRef) ? selectedRef
    : scoreRefs.some((ref) => ref.key === chosenRef) ? chosenRef! : data.defaultScoreRef ?? scoreRefs[0]?.key ?? ''
  const visiblePredictions = useMemo(() => inspectorPredictionsForScore(
    data, scoreRef, selectedRun, selectedScore, trainingVisible,
  ), [data, scoreRef, selectedRun, selectedScore, trainingVisible])
  const availableViews = visiblePredictions.sampleLinking ? [...VIEWS, 'agreement', 'samples'] as const : VIEWS

  // App choices must reach a still-mounted Inspector. Local variant/layout state
  // survives hiding; a nonwinning variant deliberately carries no winner score.
  useEffect(() => {
    const winner = data.defaultCompare.find((id) => data.chainRuns.get(id)?.id === props.selectedRunId)
    if (winner) {
      setSelection((current) => !props.selectedScoreId && current.some((id) => data.chainRuns.get(id)?.id === props.selectedRunId) ? current : [winner])
      setCompare((current) => !props.selectedScoreId && current.some((id) => data.chainRuns.get(id)?.id === props.selectedRunId) ? current : [winner])
    } else {
      setSelection([])
      setCompare([])
    }
  }, [props.selectedRunId, props.selectedScoreId, data])

  const chooseRef = (key: string) => {
    setChosenRef(key)
    const ref = data.scoreRefs.find((candidate) => candidate.key === key)
    const chain = data.chains.find((candidate) => candidate.id === selection[0])
    const run = chain && data.chainRuns.get(chain.id)
    if (chain && run && ref && chain.attributes?.selection === 'dag-ml selected') {
      const score = scoreForInspectorRef(run, ref, selectedRun?.id === run.id ? selectedScore : undefined)
      if (score) props.onSelect(run, score)
      else props.onClearSelection?.()
    }
  }

  return (
    <section aria-label="Owner results Inspector" data-owner-inspector data-selected-run-id={props.selectedRunId ?? undefined} data-selected-score-id={props.selectedScoreId ?? undefined} data-selected-chain-id={selection[0]} className="flex h-full min-h-0 flex-col">
      <div className="mb-3 max-h-[30vh] shrink-0 overflow-auto">
        <ResultsNotices runs={runs} dataset={dataset} datasetName={datasetName} warnings={visiblePredictions.warnings} />
        {data.scoreRefs.some((ref) => ref.protocol === 'refit-resubstitution') && <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={trainingVisible} onChange={(event) => {
            setShowResubstitution(event.target.checked)
            if (!event.target.checked) {
              setChosenRef(null)
              if (selectedTraining) props.onClearSelection?.()
            }
          }} />
          Show training resubstitution scores (training evaluation only)
        </label>}
        {scoreRefs.length > 0 && <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          Evaluation score
          <select aria-label="Evaluation score" value={scoreRef} onChange={(event) => chooseRef(event.target.value)} className="rounded border border-border bg-background px-2 py-1">
            {scoreRefs.map((ref) => <option key={ref.key} value={ref.key}>{ref.label}</option>)}
          </select>
        </label>}
        {selectedRun && selectedScore && <ScoreContextCaption run={selectedRun} score={selectedScore} />}
      </div>
      {!scoreRef && <p role="status" data-testid="n4a-inspector-score-placeholder" className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Training resubstitution scores are hidden. Enable “Show training resubstitution scores” to inspect training evaluation.
      </p>}
      {scoreRef && <Inspector
        chains={data.chains}
        scoreRefs={scoreRefs.filter((ref) => ref.key === scoreRef)}
        scoreRef={scoreRef}
        onScoreRefChange={chooseRef}
        predictions={visiblePredictions.predictions}
        unavailablePredictions={visiblePredictions.unavailable}
        compare={compare}
        onCompareChange={setCompare}
        selection={selection}
        availableViews={availableViews}
        localStatistics={false}
        defaultLayout={{ preset: 'grid', views: ['top', data.chains.every((chain) => chain.task === 'classification') ? 'confusion' : 'parity', 'table'], maximized: null }}
        onSelectionChange={(ids) => {
          setSelection(ids)
          setCompare(ids.slice(0, 1))
          const chain = data.chains.find((candidate) => candidate.id === ids[0])
          const run = chain && data.chainRuns.get(chain.id)
          if (!chain || !run) return
          if (chain.attributes?.selection !== 'dag-ml selected') {
            props.onSelectRun?.(run)
            return
          }
          const ref = data.scoreRefs.find((candidate) => candidate.key === scoreRef)
          const score = ref && scoreForInspectorRef(run, ref, selectedRun?.id === run.id ? selectedScore : undefined)
          if (score) props.onSelect(run, score)
          else props.onSelectRun?.(run)
        }}
        className="min-h-0 flex-1"
      />}
      {selectedRun && selectedScore && <div className="max-h-[25vh] shrink-0 overflow-auto"><OwnerPredictionRows score={selectedScore} /></div>}
    </section>
  )
}
