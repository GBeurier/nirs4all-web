import { useMemo, useState } from 'react'
import { Playground, type PipelineStep, type PlaygroundViewId } from 'nirs4all-ui/playground'
import 'nirs4all-ui/assets/workbench.css'
import type { DatasetViewProps } from '@/components/contracts'
import { downloadJson } from '@/lib/download'
import { PLAYGROUND_OPERATORS, playgroundDataset, playgroundSelectionIds } from './playgroundAdapter'
import { usePlaygroundHost } from './usePlaygroundHost'

const AVAILABLE_VIEWS: readonly PlaygroundViewId[] = [
  'spectra', 'scores', 'target', 'outliers', 'loadings', 'folds', 'repetitions', 'heatmap', 'samples',
]

export function PlaygroundPanel({ ds, summary, onOpenConfig }: DatasetViewProps) {
  const dataset = useMemo(() => playgroundDataset(ds, summary.name), [ds, summary.name])
  const host = usePlaygroundHost(ds, dataset.id)
  const [pipeline, setPipeline] = useState<readonly PipelineStep[]>([])
  return (
    <section aria-label="Dataset exploration" data-owner-playground className="flex h-full min-h-0 flex-col">
      <p className="mb-3 shrink-0 text-sm text-muted-foreground">
        {ds.nSamples} samples × {ds.nFeatures} wavelengths. {dataset.description}
        {' '}Preprocessing and PCA are fitted on all displayed rows, exploration only; they are separate from pipeline training.
        {' '}UMAP, outlier monitoring and repetition distances are unavailable in this Playground. Native preview folds are available on Explore’s PCA tab.
      </p>
      <Playground
        className="flex-1"
        key={dataset.id}
        dataset={dataset}
        operators={PLAYGROUND_OPERATORS}
        pipeline={pipeline}
        onPipelineChange={(steps) => { host.invalidate(); setPipeline(steps) }}
        result={host.result}
        status={host.status}
        error={host.error}
        onRunRequest={host.onRunRequest}
        availableViews={AVAILABLE_VIEWS}
        localStatistics={false}
        strings={{
          needsProjection: 'Requested projection unavailable in Web. UMAP is unsupported; PCA requires Methods and at least two rows.',
          needsOutliers: 'Outlier monitoring unavailable in Web: no reference/monitored protocol configured.',
          needsLoadings: 'PCA loadings unavailable in Web for this request; check the owner preview status.',
          needsFolds: 'Use Fold colouring on Explore’s PCA tab for a native preview; configure training CV in the pipeline editor.',
          needsRepetitions: 'Repetition distances unavailable in Web.',
          needsGroupColumn: 'Repetition distances unavailable in Web.',
        }}
        defaultLayout={{ preset: 'grid', views: ['spectra', 'scores', 'target', 'samples'], maximized: null }}
        headerActions={<button type="button" onClick={onOpenConfig} className="rounded border border-border px-3 py-1.5 text-sm">Configure</button>}
        onExportSelection={(rows) => downloadJson('selected-samples.json', { rows, sampleIds: playgroundSelectionIds(ds, rows) })}
      />
    </section>
  )
}
