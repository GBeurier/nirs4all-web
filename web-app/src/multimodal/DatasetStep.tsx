import { useEffect, useState, type ReactNode } from 'react'
import type { MultimodalDataOrigin, MultimodalDataStatus } from 'nirs4all-ui/multimodal'
import type { LabDataPreset } from './data'

/**
 * First step of the laboratory: your files through the Dataset Builder, or one of the
 * bundled examples. The analysis kind follows the data (see the Analysis step).
 */
export function DatasetStep({ builder, examples, caseTitles, origin, status, summary, onLoadExample, disabled }: {
  builder: ReactNode
  /** The active dataset, shown in place of the builder once it has been created from files. */
  summary: { name: string; samples: number; sources: readonly string[]; target: string } | null
  examples: readonly LabDataPreset[]
  /** Case titles, by case id (the laboratory's cases include time series). */
  caseTitles: Readonly<Record<string, string>>
  origin: MultimodalDataOrigin | null
  status: MultimodalDataStatus
  onLoadExample: (preset: LabDataPreset) => void
  disabled: boolean
}) {
  const [tab, setTab] = useState<'import' | 'examples'>('import')
  // "Create dataset" closes the builder: the created dataset is summarised here and shown in the steps below.
  const [builderOpen, setBuilderOpen] = useState(true)
  useEffect(() => {
    if (origin?.kind !== 'import') return
    setBuilderOpen(false)
    setTab('import')
    const timer = window.setTimeout(() => document.getElementById('n4mm-explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
    return () => window.clearTimeout(timer)
  }, [origin])
  const busy = status.kind === 'loading'
  const created = origin?.kind === 'import' && status.kind === 'ready' && summary && !builderOpen
  return (
    <div className="n4mm-data">
      <div className="n4mm-segmented" role="group" aria-label="Data origin">
        <button type="button" aria-pressed={tab === 'import'} onClick={() => setTab('import')}>Import your files</button>
        <button type="button" aria-pressed={tab === 'examples'} onClick={() => setTab('examples')}>Example datasets</button>
      </div>
      {tab === 'import' && created ? (
        <div className="n4mm-data__pane n4mm-created">
          <div>
            <strong>{summary.name}</strong> created from your files: {summary.samples} samples, target {summary.target},
            sources {summary.sources.join(' · ')}. Explore it below.
          </div>
          <button type="button" className="n4mm-button" data-variant="quiet" disabled={disabled} onClick={() => setBuilderOpen(true)}>Import other files</button>
        </div>
      ) : null}
      <div className="n4mm-data__pane" hidden={tab !== 'import' || Boolean(created)}>
        <p className="n4mm-note">
          Drop all the files of your dataset (a target table, one table per source, and optionally <code>manifest.json</code>). They are
          read in this browser by the nirs4all IO and Formats owners; sources are joined by sample identifier, never by row position.
          The analysis kind follows your sources: marker tables give a spectra-and-markers analysis, images a spectra-and-images one, time series a spectra-and-time-series one.
        </p>
        {builder}
      </div>
      {tab === 'examples' ? (
        <div className="n4mm-data__pane">
          <p className="n4mm-note">
            Deterministic synthetic datasets bundled with this page, loaded through the same import route as your files. Scores on them
            illustrate mechanisms, not real-world rankings.
          </p>
          <ul className="n4mm-list">
            {examples.map(preset => {
              const loaded = origin?.kind === 'preset' && origin.presetId === preset.id
              const kind = caseTitles[preset.caseId]
              return (
                <li key={preset.id} className="n4mm-list__item" data-active={loaded || undefined}>
                  <div className="n4mm-list__main">
                    <span className="n4mm-list__title">{preset.label}</span>
                    <span className="n4mm-list__text">{kind ? `${kind}. ` : ''}{preset.description}</span>
                    {preset.facts?.length ? (
                      <dl className="n4mm-facts">
                        {preset.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
                      </dl>
                    ) : null}
                  </div>
                  <button type="button" className="n4mm-button" data-variant={loaded ? 'quiet' : undefined}
                    disabled={disabled || busy} onClick={() => onLoadExample(preset)}>{loaded ? 'Reload' : 'Load'}</button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      <StatusLine status={status} origin={origin} />
    </div>
  )
}

function StatusLine({ status, origin }: { status: MultimodalDataStatus; origin: MultimodalDataOrigin | null }) {
  if (status.kind === 'loading') return <p className="n4mm-status" role="status" data-tone="busy">{status.label}</p>
  if (status.kind === 'error') {
    return <div className="n4mm-alert" role="alert"><strong>{status.name ?? 'Import refused'}</strong><span>{status.message}</span></div>
  }
  if (status.kind === 'ready' && origin) {
    return (
      <p className="n4mm-status" role="status">
        {origin.kind === 'preset'
          ? 'Example dataset loaded through the IO import route. Import your files to replace it.'
          : `Imported ${origin.fileNames.length} file${origin.fileNames.length === 1 ? '' : 's'}: ${origin.fileNames.join(', ')}`}
      </p>
    )
  }
  return <p className="n4mm-status" role="status">No data loaded yet. Import your files or load an example.</p>
}
