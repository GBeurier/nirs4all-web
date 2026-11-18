import { PipelineChainEditor, type PipelineChainDocument } from 'nirs4all-ui/pipelineEditor'
import { Inspector, type InspectorViewId } from 'nirs4all-ui/inspector'
import { useMemo, useState } from 'react'
import { FUSION_LEVEL_LABEL, LAB_CATALOG, type FusionLevel, type FusionPreset } from './fusion'
import { LAB_SCORE_REFS, inspectorChains, inspectorPredictions, type LabRunRecord } from './inspector'
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
  running: boolean
  progress: string | null
  error: string | null
  notice: string | null
  runtimeReady: boolean
  onRun: () => void
  onRunPresets: () => void
  onCancel: () => void
  onExport: () => void
  onImport: (file: File) => void
}

/** Fusion presets, the canonical chain editor and the run controls. Host state only. */
export function FusionEditor(props: FusionEditorProps) {
  const { dataset, presets, presetId, document, running } = props
  const preset = presets.find(item => item.id === presetId) ?? null
  const fused = presets.filter(item => item.level !== 'single').length
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
                  <button key={item.id} type="button" className="n4fl-chip" aria-pressed={item.id === presetId} disabled={running}
                    title={item.summary} onClick={() => props.onLoadPreset(item.id)}>{item.label}</button>
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
        variantCount={1}
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
            <button type="button" className="n4mm-button" disabled={!props.runtimeReady} onClick={props.onRunPresets}
              title="Runs the unedited presets of this dataset with the same validation protocol and adds them to the comparison.">
              Run all {presets.length} presets ({fused} fusions + {presets.length - fused} single-source)
            </button>
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
  const predictions = useMemo(() => inspectorPredictions(runs), [runs])
  const [scoreRef, setScoreRef] = useState('oof_rmse')
  const [compare, setCompare] = useState<readonly string[]>([])
  const folds = new Set(runs.map(run => run.candidate.foldsFingerprint))
  const byId = new Map(runs.map(run => [run.id, run]))
  if (!runs.length) {
    return <p className="n4mm-status" role="status">No completed run yet. Run a pipeline, or run all presets, to compare fusion strategies here.</p>
  }
  return (
    <div className="n4fl-results" data-fusion-results>
      <div className="n4fl-results-head">
        <p>
          {runs.length} completed run{runs.length === 1 ? '' : 's'} on <strong>{dataset.name}</strong>. Rank them on cross-validation (OOF)
          scores; read the held-out test score only for the recipe you finally choose.
        </p>
        <button type="button" className="n4mm-button" data-variant="quiet" disabled={disabled} onClick={onClear}>Clear runs</button>
      </div>
      {folds.size > 1 ? (
        <p className="n4mm-alert" role="alert">These runs used {folds.size} different fold sets (the validation protocol changed). Compare only runs with the same “folds” attribute.</p>
      ) : null}
      <Inspector
        title="Fusion runs"
        chains={chains}
        scoreRefs={LAB_SCORE_REFS}
        scoreRef={scoreRef}
        onScoreRefChange={setScoreRef}
        predictions={predictions}
        compare={compare}
        onCompareChange={setCompare}
        maxCompare={4}
        availableViews={VIEWS}
        localStatistics={false}
        defaultLayout={{ preset: 'grid', views: ['top', 'parity', 'folds', 'table'], maximized: null }}
        onOpenChain={chain => { const run = byId.get(chain.id); if (run && !disabled) onRestore(run) }}
      />
    </div>
  )
}
