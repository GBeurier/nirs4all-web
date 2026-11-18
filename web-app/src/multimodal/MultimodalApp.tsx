import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MultimodalWorkbench,
  defaultCandidates,
  type MultimodalCandidate,
  type MultimodalCaseId,
  type MultimodalConfig,
  type MultimodalDataOrigin,
  type MultimodalDataPreset,
  type MultimodalDataStatus,
  type MultimodalImportProfile,
  type MultimodalParamValue,
  type MultimodalRunResult,
  type MultimodalRunState,
  type MultimodalRuntimeStatus,
} from 'nirs4all-ui/multimodal'
import type { PipelineChainDocument } from 'nirs4all-ui/pipelineEditor'
import { fromCanonicalPipeline, toCanonicalPipeline } from 'nirs4all-ui/pipelineEditor'
import { downloadJson } from '@/lib/download'
import { createLabClient, defaultLabConfig, type LabClient } from './client'
import { IMPORT_PROFILES, TEACHING_PRESETS, importLabFiles, loadTeachingDataset } from './data'
import { toExecutionConfig, toWorkbenchProgress, toWorkbenchResult } from './presentation'
import type { LabCase, LabConfig, LabDataset, LabRunResult } from './types'
import { DatasetBuilderHost } from './DatasetBuilderHost'
import { pipelineStrategy } from './recipes'
import { fusionPresets, toLabDocument, type FusionPreset } from './fusion'
import type { LabRunRecord } from './inspector'
import { FusionEditor, FusionResults } from './FusionLab'

const DEFAULT_PRESET = 'early'
const HISTORY_LIMIT = 50
const PIPELINE_SCHEMA = 'nirs4all.multimodal-lab.pipeline.v2'

/** `?case=genetics&preset=late-stacking` opens a case on a preset (links from the training slides). */
function linkTarget(): { caseId: MultimodalCaseId | null; presetId: string | null } {
  if (typeof window === 'undefined') return { caseId: null, presetId: null }
  const params = new URLSearchParams(window.location.search)
  const value = params.get('case')
  return { caseId: value === 'spectroscopy' || value === 'genetics' || value === 'images' ? value : null, presetId: params.get('preset') }
}
const LINK = linkTarget()

/**
 * Host assembly for the multimodal laboratory. Owns React state only and
 * connects the controlled shared workbench to the data lane (`./data`, IO
 * owner import) and the execution lane (`./client`, worker + native owners).
 * No parsing, numerics, fold construction or scheduling happen here.
 */

/** Type-only seam for the data lane (DATA_CONTRACT.md); a mismatch fails here, precisely. */
interface LabDataHost {
  presets: readonly MultimodalDataPreset[]
  importProfiles: readonly MultimodalImportProfile[]
  loadTeachingDataset(caseId: LabCase, presetId?: string): Promise<LabDataset>
  importLabFiles(files: File[], caseId: LabCase): Promise<LabDataset>
}

const dataHost: LabDataHost = {
  presets: TEACHING_PRESETS,
  importProfiles: IMPORT_PROFILES,
  loadTeachingDataset,
  importLabFiles,
}

const BACK_HREF = '../'
const BRAND_SRC = '../brand/icon.svg'

interface CaseWorkspace {
  dataset: LabDataset | null
  origin: MultimodalDataOrigin | null
  status: MultimodalDataStatus
  config: MultimodalConfig | null
  candidates: readonly MultimodalCandidate[]
  selectedSampleId: string | null
  run: MultimodalRunState
  results: MultimodalRunResult | null
  /** Raw execution result kept for the results export (same run as `results`). */
  rawResult: LabRunResult | null
  presets: FusionPreset[]
  presetId: string | null
  /** Last preset loaded; edits of it are named after it. */
  basePresetId: string | null
  chain: PipelineChainDocument | null
  past: PipelineChainDocument[]
  future: PipelineChainDocument[]
  pipelineError: string | null
  pipelineNotice: string | null
  /** Every completed run on the current dataset, for the Inspector. */
  runs: LabRunRecord[]
}

const EMPTY_WORKSPACE: CaseWorkspace = {
  dataset: null, origin: null, status: { kind: 'empty' }, config: null, candidates: [],
  selectedSampleId: null, run: { kind: 'idle' }, results: null, rawResult: null,
  presets: [], presetId: null, basePresetId: null, chain: null, past: [], future: [], pipelineError: null, pipelineNotice: null, runs: [],
}

type Workspaces = Record<MultimodalCaseId, CaseWorkspace>

const INITIAL_WORKSPACES: Workspaces = {
  spectroscopy: EMPTY_WORKSPACE, genetics: EMPTY_WORKSPACE, images: EMPTY_WORKSPACE,
}

/** Execution params are `unknown`; the controlled UI only edits primitive values. */
function toWorkbenchConfig(config: LabConfig): MultimodalConfig {
  return {
    ...config,
    sourceChains: config.sourceChains.map(chain => ({
      sourceId: chain.sourceId,
      steps: chain.steps.map(step => ({
        methodId: step.methodId,
        params: Object.fromEntries(Object.entries(step.params).filter((entry): entry is [string, MultimodalParamValue] =>
          typeof entry[1] === 'number' || typeof entry[1] === 'string' || typeof entry[1] === 'boolean')),
      })),
    })),
  }
}

function teachingSetup(dataset: LabDataset, wanted: string | null = null): Pick<CaseWorkspace, 'config' | 'candidates' | 'presets' | 'presetId' | 'basePresetId' | 'chain' | 'past' | 'future'> {
  const config = toWorkbenchConfig(defaultLabConfig(dataset))
  const presets = fusionPresets(dataset)
  const preset = presets.find(item => item.id === wanted) ?? presets.find(item => item.id === DEFAULT_PRESET) ?? presets[0]
  return { config, candidates: defaultCandidates(dataset, config.sourceIds), presets,
    presetId: preset?.id ?? null, basePresetId: preset?.id ?? null, chain: preset ? structuredClone(preset.document) : null, past: [], future: [] }
}

let runCounter = 0

function browserRuntime(): MultimodalRuntimeStatus {
  const capable = typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
  return capable
    ? { state: 'ready', label: 'Local WASM runtime', detail: 'Owners load in a background worker on the first run.' }
    : { state: 'unavailable', label: 'Runtime unavailable', detail: 'This browser lacks Web Workers or WebAssembly.' }
}

function errorStatus(reason: unknown): { name: string; message: string } {
  const error = reason instanceof Error ? reason : new Error(String(reason))
  return { name: error.name || 'Error', message: error.message }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'multimodal-lab'
}

/**
 * Edits return the run state to idle. Completed runs stay in the comparison (and
 * its export) until the data change or the user clears them.
 */
function invalidate(current: CaseWorkspace): CaseWorkspace {
  return { ...current, run: { kind: 'idle' } }
}

function datasetMeta(dataset: LabDataset, origin: MultimodalDataOrigin | null) {
  return {
    caseId: dataset.caseId, name: dataset.name, fingerprint: dataset.fingerprint, origin,
    samples: dataset.sampleIds.length,
    target: { name: dataset.target.name, unit: dataset.target.unit },
    sources: dataset.sources.map(source => ({
      id: source.id, label: source.label, modality: source.modality, representation: source.representation, shape: source.shape,
      axis: source.axis ? { unit: source.axis.unit, kind: source.axis.kind, first: source.axis.values[0],
        last: source.axis.values[source.axis.values.length - 1], points: source.axis.values.length } : null,
    })),
    alignment: dataset.alignment,
  }
}

export default function MultimodalApp() {
  const [caseId, setCaseId] = useState<MultimodalCaseId>(LINK.caseId ?? 'spectroscopy')
  const [workspaces, setWorkspaces] = useState<Workspaces>(INITIAL_WORKSPACES)
  const [runtime, setRuntime] = useState<MultimodalRuntimeStatus>(browserRuntime)
  const clientRef = useRef<LabClient | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const loadToken = useRef<Record<MultimodalCaseId, number>>({ spectroscopy: 0, genetics: 0, images: 0 })
  const runToken = useRef(0)
  const linkPreset = useRef<string | null>(LINK.presetId)
  const workspace = workspaces[caseId]
  const pipelineProblem = useMemo(() => {
    if (!workspace.dataset || !workspace.chain) return 'Load data and a pipeline preset first.'
    try { toLabDocument(workspace.dataset, workspace.chain); return null }
    catch (reason) { return errorStatus(reason).message }
  }, [workspace.dataset, workspace.chain])

  const patch = useCallback((id: MultimodalCaseId, update: (current: CaseWorkspace) => CaseWorkspace) => {
    setWorkspaces(previous => ({ ...previous, [id]: update(previous[id]) }))
  }, [])

  useEffect(() => () => { abortRef.current?.abort(); clientRef.current?.dispose() }, [])

  // ---- data ---------------------------------------------------------------

  const acceptDataset = useCallback((id: MultimodalCaseId, token: number, dataset: LabDataset, origin: MultimodalDataOrigin) => {
    if (loadToken.current[id] !== token) return
    if (dataset.caseId !== id) {
      patch(id, current => ({ ...current, status: { kind: 'error', name: 'Case mismatch',
        message: `The files describe the "${dataset.caseId}" case, not "${id}". Select that case or import matching files.` } }))
      return
    }
    const wanted = linkPreset.current
    linkPreset.current = null
    patch(id, () => ({ ...EMPTY_WORKSPACE, dataset, origin, status: { kind: 'ready' }, ...teachingSetup(dataset, wanted),
      selectedSampleId: dataset.sampleIds[0] ?? null }))
  }, [patch])

  const failLoad = useCallback((id: MultimodalCaseId, token: number, reason: unknown) => {
    if (loadToken.current[id] !== token) return
    const { name, message } = errorStatus(reason)
    // Previous data, configuration and results stay intact when a new import is refused.
    patch(id, current => ({ ...current, status: { kind: 'error', name, message } }))
  }, [patch])

  const loadPreset = useCallback((id: MultimodalCaseId, presetId: string) => {
    const token = ++loadToken.current[id]
    const preset = dataHost.presets.find(candidate => candidate.id === presetId)
    patch(id, current => ({ ...current, status: { kind: 'loading', label: `Loading ${preset?.label ?? presetId} through the IO import route…` } }))
    dataHost.loadTeachingDataset(id, presetId)
      .then(dataset => acceptDataset(id, token, dataset, { kind: 'preset', presetId }))
      .catch(reason => failLoad(id, token, reason))
  }, [acceptDataset, failLoad, patch])

  const importFiles = useCallback((id: MultimodalCaseId, profileId: string, files: readonly File[]) => {
    const token = ++loadToken.current[id]
    patch(id, current => ({ ...current, status: { kind: 'loading', label: `Importing ${files.length} file${files.length === 1 ? '' : 's'} with the IO owner…` } }))
    dataHost.importLabFiles([...files], id)
      .then(dataset => acceptDataset(id, token, dataset, { kind: 'import', profileId, fileNames: files.map(file => file.name) }))
      .catch(reason => failLoad(id, token, reason))
  }, [acceptDataset, failLoad, patch])

  // Open each case once with its first bundled preset; never replaces loaded or imported data.
  useEffect(() => {
    if (workspace.dataset || workspace.status.kind !== 'empty') return
    const preset = dataHost.presets.find(candidate => candidate.caseId === caseId)
    if (preset) loadPreset(caseId, preset.id)
  }, [caseId, workspace.dataset, workspace.status.kind, loadPreset])

  // ---- configuration (every edit invalidates the current result) -----------

  const onConfigChange = useCallback((next: MultimodalConfig) => {
    patch(caseId, current => ({ ...invalidate(current), config: next }))
  }, [caseId, patch])

  const onCandidatesChange = useCallback((next: readonly MultimodalCandidate[]) => {
    patch(caseId, current => ({ ...invalidate(current), candidates: next }))
  }, [caseId, patch])

  const onRestoreTeachingConfig = useCallback(() => {
    patch(caseId, current => current.dataset ? { ...invalidate(current), ...teachingSetup(current.dataset) } : current)
  }, [caseId, patch])

  const changePipeline = useCallback((chain: PipelineChainDocument, presetId: string | null = null) => {
    patch(caseId, current => ({ ...invalidate(current), chain, presetId, basePresetId: presetId ?? current.basePresetId,
      past: current.chain ? [...current.past, current.chain].slice(-HISTORY_LIMIT) : current.past, future: [],
      pipelineError: null, pipelineNotice: null }))
  }, [caseId, patch])

  const undo = useCallback(() => patch(caseId, current => {
    const previous = current.past[current.past.length - 1]
    return previous && current.chain ? { ...invalidate(current), chain: previous, presetId: null, past: current.past.slice(0, -1),
      future: [current.chain, ...current.future] } : current
  }), [caseId, patch])

  const redo = useCallback(() => patch(caseId, current => {
    const next = current.future[0]
    return next && current.chain ? { ...invalidate(current), chain: next, presetId: null, past: [...current.past, current.chain],
      future: current.future.slice(1) } : current
  }), [caseId, patch])

  // ---- execution ----------------------------------------------------------

  const execute = useCallback((jobs: Array<{ chain: PipelineChainDocument; name: string }>, batch: boolean) => {
    const id = caseId
    const { dataset, config } = workspaces[id]
    if (!dataset || !config || jobs.length === 0) return
    let documents
    try { documents = jobs.map(job => ({ chain: job.chain, name: job.name, lab: toLabDocument(dataset, job.chain) })) }
    catch (reason) { patch(id, current => ({ ...current, pipelineError: errorStatus(reason).message })); return }
    const sourceIds = dataset.sources.map(source => source.id)
    const configs = documents.map(({ lab }) => ({ ...toExecutionConfig(config), pipeline: lab, sourceIds, strategy: pipelineStrategy(lab) }))
    const token = ++runToken.current
    const controller = new AbortController()
    abortRef.current = controller
    const client = clientRef.current ??= createLabClient()
    patch(id, current => ({ ...invalidate(current), pipelineError: null, pipelineNotice: null, run: { kind: 'running', progress: null } }))
    client.run(dataset, configs, progress => {
      if (runToken.current !== token) return
      patch(id, current => current.run.kind === 'running'
        ? { ...current, run: { kind: 'running', progress: toWorkbenchProgress(progress) } } : current)
    }, controller.signal)
      .then(result => {
        if (runToken.current !== token) return
        const versions = Object.entries(result.ownerVersions)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .map(([name, version]) => ({ name, version }))
        setRuntime({ state: 'ready', label: 'Local WASM runtime ready', detail: versions.map(v => `${v.name} ${v.version}`).join(' · '), versions })
        const finishedAt = new Date().toISOString()
        // The native label is the document label; presets have distinct labels.
        const records: LabRunRecord[] = result.candidates.flatMap(candidate => {
          const match = documents.find(item => item.lab.label === candidate.label)
          return match ? [{ id: `run-${++runCounter}`, index: runCounter, name: match.name, document: match.lab, canonical: toCanonicalPipeline(match.chain),
            candidate, datasetFingerprint: dataset.fingerprint, finishedAt, protocol: { calibrationIds: result.calibrationIds,
            holdoutIds: result.holdoutIds, folds: result.folds, foldsFingerprint: result.foldsFingerprint, validation: result.validation,
            ownerVersions: result.ownerVersions } }] : []
        })
        const refused = result.refusals.map(refusal => refusal.reason)
        patch(id, current => ({ ...current,
          run: result.candidates.length > 0 ? { kind: 'done' }
            : { kind: 'error', name: 'NativeExecutionRefusal', message: refused.join('; ') || 'No pipeline completed.' },
          results: toWorkbenchResult(result), rawResult: result,
          runs: current.dataset === dataset ? [...current.runs, ...records] : current.runs,
          pipelineNotice: `${records.length} run${records.length === 1 ? '' : 's'} added to the comparison${batch ? ' (unedited presets)' : ''}.`
            + (refused.length ? ` ${refused.length} refused: ${refused.join('; ')}` : ''),
        }))
      })
      .catch(reason => {
        if (runToken.current !== token) return
        const { name, message } = errorStatus(reason)
        patch(id, current => ({ ...current,
          run: name === 'AbortError' ? { kind: 'cancelled', message } : { kind: 'error', name, message } }))
      })
      .finally(() => { if (abortRef.current === controller) abortRef.current = null })
  }, [caseId, patch, workspaces])

  const onRunEdited = useCallback(() => {
    const { chain, presetId, basePresetId, presets } = workspaces[caseId]
    const base = presets.find(preset => preset.id === (presetId ?? basePresetId))?.label
    if (chain) execute([{ chain, name: presetId && base ? base : base ? `Edited ${base}` : 'Edited pipeline' }], false)
  }, [caseId, execute, workspaces])

  const onRunPresets = useCallback(() => {
    execute(workspaces[caseId].presets.map(preset => ({ chain: preset.document, name: preset.label })), true)
  }, [caseId, execute, workspaces])

  const onCancel = useCallback(() => { abortRef.current?.abort() }, [])

  const importPipeline = useCallback(async (file: File) => {
    const dataset = workspaces[caseId].dataset
    if (!dataset) return
    try {
      const imported = JSON.parse(await file.text())
      const chain = fromCanonicalPipeline(imported && typeof imported === 'object' && 'schema' in imported ? imported.pipeline : imported)
      toLabDocument(dataset, chain)
      patch(caseId, current => current.dataset === dataset ? { ...invalidate(current), chain, presetId: null,
        past: current.chain ? [...current.past, current.chain].slice(-HISTORY_LIMIT) : current.past, future: [],
        pipelineError: null, pipelineNotice: `Imported ${file.name}.` } : current)
    } catch (reason) {
      patch(caseId, current => current.dataset === dataset ? { ...current, pipelineError: `${file.name}: ${errorStatus(reason).message}` } : current)
    }
  }, [caseId, patch, workspaces])

  // ---- exports ------------------------------------------------------------

  const onExportPipeline = useCallback(() => {
    const { dataset, origin, chain } = workspaces[caseId]
    if (!dataset || !chain) return
    downloadJson(`${slug(chain.name ?? 'pipeline')}.pipeline.json`, {
      schema: PIPELINE_SCHEMA, pipeline: toCanonicalPipeline(chain), sources: datasetMeta(dataset, origin).sources,
    })
  }, [caseId, workspaces])

  const onExportConfig = useCallback(() => {
    const { dataset, origin, config, chain } = workspaces[caseId]
    if (!dataset || !config) return
    downloadJson(`${slug(dataset.name)}.lab-config.json`, {
      schema: 'nirs4all.multimodal-lab.config.v2', exportedAt: new Date().toISOString(),
      dataset: datasetMeta(dataset, origin), validation: config.validation, pipeline: chain ? toCanonicalPipeline(chain) : null,
      note: 'Fixed a priori settings. This file documents an experiment; it is not an executable .n4a model.',
    })
  }, [caseId, workspaces])

  const onExportResults = useCallback(() => {
    const { dataset, origin, runs } = workspaces[caseId]
    if (!dataset || runs.length === 0) return
    // Portable predictor packages are omitted: they may embed training rows and need explicit consent elsewhere.
    downloadJson(`${slug(dataset.name)}.lab-results.json`, {
      schema: 'nirs4all.multimodal-lab.results.v2', exportedAt: new Date().toISOString(),
      dataset: datasetMeta(dataset, origin),
      runs: runs.map(({ candidate: { portablePackageJson: _omitted, ...candidate }, ...run }) => ({ ...run, candidate })),
      note: 'Scores computed by the native owners. OOF and held-out scopes are separate; portable predictor packages omitted.',
    })
  }, [caseId, workspaces])

  // ---- render -------------------------------------------------------------

  const brand = useMemo(() => <img src={BRAND_SRC} alt="nirs4all" width={40} height={40} draggable={false} />, [])
  const running = workspace.run.kind === 'running'
  const progress = workspace.run.kind === 'running' && workspace.run.progress
    ? `${(workspace.run.progress.total ?? 1) > 1 ? `Pipeline ${(workspace.run.progress.completed ?? 0) + 1} of ${workspace.run.progress.total} · ` : ''}${workspace.run.progress.phase} · ${workspace.run.progress.message}`
    : null

  return (
    <MultimodalWorkbench
      brand={brand}
      backHref={BACK_HREF}
      backLabel="nirs4all Web workbench"
      runtime={runtime}
      caseId={caseId}
      onCaseChange={setCaseId}
      presets={dataHost.presets}
      importProfiles={dataHost.importProfiles}
      dataOrigin={workspace.origin}
      dataStatus={workspace.status}
      dataset={workspace.dataset}
      onLoadPreset={presetId => loadPreset(caseId, presetId)}
      onImportFiles={(profileId, files) => importFiles(caseId, profileId, files)}
      datasetBuilder={<DatasetBuilderHost key={caseId} caseId={caseId} disabled={running}
        onCreate={(dataset, fileNames) => acceptDataset(caseId, ++loadToken.current[caseId], dataset,
          { kind: 'import', profileId: `manifest-${caseId}`, fileNames })} />}
      pipelineLead="Pick a fusion preset, then edit it: each source has its own lane; the step after the lanes decides where the sources are fused. Runs accumulate in the comparison below."
      presetComparison={false}
      pipelineEditor={workspace.dataset && workspace.chain ? <>
        <FusionEditor
          dataset={workspace.dataset}
          presets={workspace.presets}
          presetId={workspace.presetId}
          document={workspace.chain}
          onDocumentChange={next => changePipeline(next)}
          onLoadPreset={presetId => {
            const preset = workspace.presets.find(item => item.id === presetId)
            if (preset) changePipeline(structuredClone(preset.document), preset.id)
          }}
          onUndo={undo}
          onRedo={redo}
          canUndo={workspace.past.length > 0}
          canRedo={workspace.future.length > 0}
          problem={pipelineProblem}
          running={running}
          progress={progress}
          error={workspace.pipelineError ?? (workspace.run.kind === 'error' ? workspace.run.message : null)}
          notice={workspace.run.kind === 'cancelled' ? 'Run cancelled. No partial result is kept.' : workspace.pipelineNotice}
          runtimeReady={runtime.state === 'ready'}
          onRun={onRunEdited}
          onRunPresets={onRunPresets}
          onCancel={onCancel}
          onExport={onExportPipeline}
          onImport={file => { void importPipeline(file) }}
        />
        <nav className="n4mm-training-downloads" aria-label="Training materials">
          <a href="../multimodal-training/slides/">Open the training slides</a>
        </nav>
      </> : undefined}
      resultsView={workspace.dataset ? <FusionResults dataset={workspace.dataset} runs={workspace.runs} disabled={running}
        onClear={() => patch(caseId, current => ({ ...current, runs: [], results: null, rawResult: null }))}
        onRestore={run => changePipeline(fromCanonicalPipeline(run.canonical))} /> : undefined}
      selectedSampleId={workspace.selectedSampleId}
      onSelectSample={sampleId => patch(caseId, current => ({ ...current, selectedSampleId: sampleId }))}
      config={workspace.config}
      onConfigChange={onConfigChange}
      onRestoreTeachingConfig={onRestoreTeachingConfig}
      candidates={workspace.candidates}
      onCandidatesChange={onCandidatesChange}
      run={workspace.run}
      onRun={onRunPresets}
      onCancel={onCancel}
      results={workspace.results}
      onExportConfig={onExportConfig}
      onExportResults={onExportResults}
    />
  )
}
