import { PipelineChainEditor, type PipelineChainDocument } from 'nirs4all-ui/pipelineEditor'
import { Inspector, type InspectorViewId } from 'nirs4all-ui/inspector'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FUSION_LEVEL_LABEL, LAB_CATALOG, type FusionLevel, type FusionPreset } from './fusion'
import { inspectorChains, inspectorPredictions, scoreRefsFor, type LabRunRecord } from './inspector'
import type { LabDataset } from './types'

const LEVELS: readonly FusionLevel[] = ['single', 'early', 'mid', 'late']

export interface FusionEditorProps {
  dataset: LabDataset
  presets: readonly FusionPreset[]
  presetId: string | null
  document: PipelineChainDocument
  onDocumentChange: (next: PipelineChainDocument) => void
  onLoadPreset: (id: string) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo: boolean
  canRedo: boolean
  /** Why the current document cannot run, or `null`. */
  problem: string | null
  /** Variants the parameter sweeps of the document make (1 without sweeps). */
  variants: number
  running: boolean
  progress: string | null
  error: string | null
  notice: string | null
  runtimeReady: boolean
  onRun: () => void
  /** Runs the unedited presets: all of them (`null`) or the selected subset. */
  onRunPresets: (ids: readonly string[] | null) => void
  onCancel: () => void
  onExport: () => void
  onImport: (file: File) => void
}

/** Fusion presets, the canonical chain editor and the run controls. Host state only. */
export function FusionEditor(props: FusionEditorProps) {
  const { dataset, presets, presetId, document, running } = props
  const preset = presets.find(item => item.id === presetId) ?? null
  const fused = presets.filter(item => item.level !== 'single').length
  // Presets ticked for a batch run; cleared when the preset list changes (another dataset or case).
  const [picked, setPicked] = useState<readonly string[]>([])
  useEffect(() => { setPicked([]) }, [presets])
  const toggle = (id: string) => setPicked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  return (
    <div className="n4fl" data-fusion-lab>
      <div className="n4fl-presets" role="group" aria-label="Fusion presets">
        {LEVELS.map(level => {
          const items = presets.filter(item => item.level === level)
          if (!items.length) return null
          return (
            <div key={level} className="n4fl-preset-group" data-level={level}>
              <span className="n4fl-preset-level">{FUSION_LEVEL_LABEL[level]}</span>
              <div className="n4fl-preset-row">
                {items.map(item => (
                  <span key={item.id} className="n4fl-chip-pick">
                    <input type="checkbox" className="n4fl-pick" checked={picked.includes(item.id)} disabled={running}
                      aria-label={`Select ${item.label} for a batch run`} title="Select for “Run selected presets”" onChange={() => toggle(item.id)} />
                    <button type="button" className="n4fl-chip" aria-pressed={item.id === presetId} disabled={running}
                      title={item.summary} onClick={() => props.onLoadPreset(item.id)}>{item.label}</button>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="n4fl-summary" aria-live="polite">
        {preset ? <><strong>{preset.label}.</strong> {preset.summary}</> : <>Edited pipeline. Load a preset to start again from a reference recipe.</>}
      </p>
      <PipelineChainEditor
        value={document}
        onChange={props.onDocumentChange}
        catalog={LAB_CATALOG}
        readOnly={running}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        variantCount={props.variants}
        inputLabel={dataset.name}
        inputDetail={`${dataset.sampleIds.length} samples · ${dataset.sources.map(source => source.label).join(' · ')}`}
        outputLabel="Prediction"
        defaultWrap={false}
        toolbarActions={
          <span className="n4fl-file">
            <button type="button" className="n4rack__btn n4rack__btn--text" onClick={props.onExport}>Export JSON</button>
            <label className="n4rack__btn n4rack__btn--text">
              Import JSON
              <input type="file" accept="application/json,.json" hidden disabled={running}
                onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) props.onImport(file) }} />
            </label>
          </span>
        }
      />
      <div className="n4fl-run" role="group" aria-label="Run">
        {running ? (
          <button type="button" className="n4mm-button" data-variant="danger" onClick={props.onCancel}>Cancel</button>
        ) : (
          <>
            <button type="button" className="n4mm-button" data-variant="primary" disabled={props.problem !== null || !props.runtimeReady} onClick={props.onRun}>
              Run this pipeline
            </button>
            <button type="button" className="n4mm-button" disabled={!props.runtimeReady || !picked.length} onClick={() => props.onRunPresets(picked)}
              title="Runs the ticked presets, unedited, with the same validation protocol and adds them to the comparison.">
              {picked.length ? `Run ${picked.length} selected preset${picked.length === 1 ? '' : 's'}` : 'Run selected presets (tick them above)'}
            </button>
            <button type="button" className="n4mm-button" disabled={!props.runtimeReady} onClick={() => props.onRunPresets(null)}
              title="Runs the unedited presets of this dataset with the same validation protocol and adds them to the comparison.">
              Run all {presets.length} presets ({fused} fusions + {presets.length - fused} single-source)
            </button>
            {picked.length ? <button type="button" className="n4mm-button" data-variant="quiet" onClick={() => setPicked([])}>Clear selection</button> : null}
          </>
        )}
        <div className="n4fl-status" role="status" aria-live="polite">
          {running ? <><progress aria-label="Pipeline execution" /> <span>{props.progress ?? 'Starting the local worker…'}</span></> : null}
          {!running && props.problem ? <span className="n4fl-problem">{props.problem}</span> : null}
          {!running && props.notice ? <span>{props.notice}</span> : null}
        </div>
        {props.error ? <p className="n4mm-alert" role="alert">{props.error}</p> : null}
      </div>
    </div>
  )
}

const VIEWS: readonly InspectorViewId[] = ['overview', 'top', 'compare', 'parity', 'residuals', 'folds', 'agreement', 'samples', 'effects', 'landscape', 'table']
const CLASSIFICATION_VIEWS: readonly InspectorViewId[] = ['overview', 'top', 'compare', 'confusion', 'folds', 'agreement', 'samples', 'effects', 'landscape', 'table']

export interface FusionResultsProps {
  dataset: LabDataset
  runs: readonly LabRunRecord[]
  onClear: () => void
  onRestore: (run: LabRunRecord) => void
  disabled: boolean
}

/** Every completed run of the current dataset in the shared Inspector. */
export function FusionResults({ dataset, runs, onClear, onRestore, disabled }: FusionResultsProps) {
  const chains = useMemo(() => inspectorChains(dataset, runs), [dataset, runs])
  const classification = dataset.target.kind === 'categorical'
  // A declared limitation of the data (for example a confounded acquisition) is read with the scores.
  const declaration = (dataset.provenance as { declaration?: { limitation?: unknown } } | undefined)?.declaration
  const limitation = typeof declaration?.limitation === 'string' ? declaration.limitation : null
  const refs = scoreRefsFor(dataset)
  const predictions = useMemo(() => inspectorPredictions(runs, classification ? dataset.target.classes : undefined), [runs, classification, dataset])
  const [scoreRef, setScoreRef] = useState(refs[0].key)
  const [compare, setCompare] = useState<readonly string[]>([])
  const folds = new Set(runs.map(run => run.candidate.foldsFingerprint))
  const byId = new Map(runs.map(run => [run.id, run]))
  // Until the user picks runs, compare the four best on the active score so fold
  // stability, parity and agreement show several recipes at once.
  const ref = refs.find(item => item.key === scoreRef) ?? refs[0]
  const best = useMemo(() => chains
    .filter(chain => typeof chain.scores[ref.key] === 'number')
    .sort((a, b) => ((a.scores[ref.key] as number) - (b.scores[ref.key] as number)) * (ref.lowerIsBetter ? 1 : -1))
    .slice(0, 4).map(chain => chain.id), [chains, ref])
  const shown = compare.filter(id => byId.has(id))
  // Open with both side panels closed: the views get the width, and "Top chains" already lists the runs.
  const host = useRef<HTMLDivElement>(null)
  const collapsed = useRef(false)
  useEffect(() => {
    if (collapsed.current || !host.current) return
    const toggles = [...host.current.querySelectorAll<HTMLButtonElement>('button[aria-label$="⇄"][aria-pressed="true"]')]
    if (!toggles.length) return
    collapsed.current = true
    toggles.forEach(button => button.click())
  })
  if (!runs.length) {
    return <p className="n4mm-status" role="status">No completed run yet. Run a pipeline, or run all presets, to compare fusion strategies here.</p>
  }
  return (
    <div className="n4fl-results" data-fusion-results ref={host}>
      <div className="n4fl-results-head">
        <p>
          {runs.length} completed run{runs.length === 1 ? '' : 's'} on <strong>{dataset.name}</strong>. Rank them on cross-validation (OOF)
          scores; read the held-out test score only for the recipe you finally choose.
        </p>
        <button type="button" className="n4mm-button" data-variant="quiet" disabled={disabled} onClick={onClear}>Clear runs</button>
      </div>
      {limitation ? <p className="n4mm-alert" role="note"><strong>Dataset limitation.</strong> {limitation}</p> : null}
      {folds.size > 1 ? (
        <p className="n4mm-alert" role="alert">These runs used {folds.size} different fold sets (the validation protocol changed). Compare only runs with the same “folds” attribute.</p>
      ) : null}
      <Inspector
        title="Fusion runs"
        chains={chains}
        scoreRefs={refs}
        scoreRef={ref.key}
        onScoreRefChange={setScoreRef}
        predictions={predictions}
        compare={shown.length ? shown : best}
        onCompareChange={setCompare}
        maxCompare={4}
        availableViews={classification ? CLASSIFICATION_VIEWS : VIEWS}
        localStatistics
        defaultLayout={{ preset: 'grid', views: ['top', 'folds', classification ? 'confusion' : 'parity', 'effects'], maximized: null }}
        onOpenChain={chain => { const run = byId.get(chain.id); if (run && !disabled) onRestore(run) }}
      />
    </div>
  )
}
