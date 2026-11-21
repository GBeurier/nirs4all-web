import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignmentTable,
  CaseSelector,
  ExportPanel,
  InstructorGuide,
  MULTIMODAL_CASES,
  SampleNavigator,
  Section,
  SourceViews,
  ValidationPanel,
  defaultCandidates,
  type MultimodalCandidate,
  type MultimodalCaseInfo,
  type MultimodalConfig,
  type MultimodalDataset,
  type MultimodalDataOrigin,
  type MultimodalDataStatus,
  type MultimodalParamValue,
  type MultimodalRunResult,
  type MultimodalRunState,
  type MultimodalRuntimeStatus,
} from 'nirs4all-ui/multimodal'
import type { PipelineChainDocument } from 'nirs4all-ui/pipelineEditor'
import { fromCanonicalPipeline, toCanonicalPipeline } from 'nirs4all-ui/pipelineEditor'
import { downloadJson } from '@/lib/download'
import { createLabClient, defaultLabConfig, type LabClient } from './client'
import { TEACHING_PRESETS, loadTeachingDataset, type LabDataPreset } from './data'
import { TimeSeriesView } from './TimeSeriesView'
import { toExecutionConfig, toWorkbenchProgress, toWorkbenchResult } from './presentation'
import type { LabCase, LabConfig, LabDataset, LabRunResult } from './types'
import { DatasetBuilderHost } from './DatasetBuilderHost'
import { pipelineStrategy } from './recipes'
import { fusionPresets, toLabDocument, type FusionPreset } from './fusion'
import type { LabRunRecord } from './inspector'
import { FusionEditor, FusionResults } from './FusionLab'
import { LabShell } from './LabShell'
import { DatasetStep } from './DatasetStep'
import { MAX_VARIANTS, expandSweeps, sweepPlan } from './sweeps'

const DEFAULT_PRESET = 'early'
const HISTORY_LIMIT = 50
const PIPELINE_SCHEMA = 'nirs4all.multimodal-lab.pipeline.v2'

/** `?case=genetics&preset=late-stacking` opens a case on a preset (links from the training slides). */
function linkTarget(): { caseId: LabCase | null; presetId: string | null } {
  if (typeof window === 'undefined') return { caseId: null, presetId: null }
  const params = new URLSearchParams(window.location.search)
  const value = params.get('case')
  return { caseId: LAB_CASES.some(info => info.id === value) ? value as LabCase : null, presetId: params.get('preset') }
}
/**
 * The shared cases plus the laboratory's time-series case. The shared presentation
 * package does not know time series yet, so the host widens its case and dataset
 * types at the component boundary (tracked debt: move the case and its view to UI).
 */
type LabCaseInfo = Omit<MultimodalCaseInfo, 'id'> & { id: LabCase }
const LAB_CASES: readonly LabCaseInfo[] = [...MULTIMODAL_CASES, {
  id: 'timeseries', title: 'Spectra and time series', modalities: 'NIRS · daily weather (several variables)',
  goal: 'A spectrum of each sample plus one multivariate series (here the weather of the 90 days before harvest). The series is context shared by every sample of a harvest: it explains differences between harvests, not between samples.',
  prompts: [
    'What can a weather series explain that the spectrum of one fruit cannot, and the reverse?',
    'Why are the folds grouped by region and season here, and what would a random split hide?',
    'Does the weather alone predict dry matter on a new season, or only on the harvests it has seen?',
    'Which fusion keeps the series as one block of time × variables rather than many unrelated columns?',
  ],
}]
const asUiCases = (cases: readonly LabCaseInfo[]) => cases as unknown as readonly MultimodalCaseInfo[]
const asUiDataset = (dataset: LabDataset) => dataset as unknown as MultimodalDataset
const LINK = linkTarget()

/**
 * Host assembly for the multimodal laboratory. Owns React state only and
 * connects the controlled shared workbench to the data lane (`./data`, IO
 * owner import) and the execution lane (`./client`, worker + native owners).
 * No parsing, numerics, fold construction or scheduling happen here.
 */

/** Type-only seam for the data lane (DATA_CONTRACT.md); a mismatch fails here, precisely. */
interface LabDataHost {
  presets: readonly LabDataPreset[]
  loadTeachingDataset(caseId: LabCase, presetId?: string): Promise<LabDataset>
}

const dataHost: LabDataHost = {
  presets: TEACHING_PRESETS,
  loadTeachingDataset,
}


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

type Workspaces = Record<LabCase, CaseWorkspace>

const INITIAL_WORKSPACES: Workspaces = {
  spectroscopy: EMPTY_WORKSPACE, genetics: EMPTY_WORKSPACE, images: EMPTY_WORKSPACE, timeseries: EMPTY_WORKSPACE,
}

/** Execution params are `unknown`; the controlled UI only edits primitive values. */
function toWorkbenchConfig(config: LabConfig): MultimodalConfig {
  return {
    ...config,
    caseId: config.caseId as MultimodalConfig['caseId'],
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
  return { config, candidates: defaultCandidates(asUiDataset(dataset), config.sourceIds), presets,
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
  const [caseId, setCaseId] = useState<LabCase>(LINK.caseId ?? 'spectroscopy')
  const [workspaces, setWorkspaces] = useState<Workspaces>(INITIAL_WORKSPACES)
  const [runtime, setRuntime] = useState<MultimodalRuntimeStatus>(browserRuntime)
  const clientRef = useRef<LabClient | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const loadToken = useRef<Record<LabCase, number>>({ spectroscopy: 0, genetics: 0, images: 0, timeseries: 0 })
  const runToken = useRef(0)
  const linkPreset = useRef<string | null>(LINK.presetId)
  const workspace = workspaces[caseId]
  const laneLabel = useCallback((id: string) => workspace.dataset?.sources.find(source => source.id === id)?.label ?? id, [workspace.dataset])
  // Sweeps run as variants: the first variant validates the structure, the count bounds the run.
  const pipelineCheck = useMemo((): { problem: string | null; variants: number } => {
    if (!workspace.dataset || !workspace.chain) return { problem: 'Load data and a pipeline preset first.', variants: 1 }
    try {
      const plan = sweepPlan(workspace.chain, laneLabel)
      toLabDocument(workspace.dataset, plan.variant(plan.sizes.map(() => 0)).chain)
      return { problem: plan.count > MAX_VARIANTS
        ? `These sweeps make ${plan.count} variants; the laboratory runs at most ${MAX_VARIANTS} per click. Narrow a range or remove a sweep.` : null,
      variants: plan.count }
    } catch (reason) { return { problem: errorStatus(reason).message, variants: 1 } }
  }, [workspace.dataset, workspace.chain, laneLabel])
  const pipelineProblem = pipelineCheck.problem

  const patch = useCallback((id: LabCase, update: (current: CaseWorkspace) => CaseWorkspace) => {
    setWorkspaces(previous => ({ ...previous, [id]: update(previous[id]) }))
  }, [])

  useEffect(() => () => { abortRef.current?.abort(); clientRef.current?.dispose() }, [])

  // ---- data ---------------------------------------------------------------

  const acceptDataset = useCallback((id: LabCase, token: number, dataset: LabDataset, origin: MultimodalDataOrigin) => {
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

  const failLoad = useCallback((id: LabCase, token: number, reason: unknown) => {
    if (loadToken.current[id] !== token) return
    const { name, message } = errorStatus(reason)
    // Previous data, configuration and results stay intact when a new import is refused.
    patch(id, current => ({ ...current, status: { kind: 'error', name, message } }))
  }, [patch])

  const loadPreset = useCallback((id: LabCase, presetId: string) => {
    const token = ++loadToken.current[id]
    const preset = dataHost.presets.find(candidate => candidate.id === presetId)
    patch(id, current => ({ ...current, status: { kind: 'loading', label: `Loading ${preset?.label ?? presetId} through the IO import route…` } }))
    dataHost.loadTeachingDataset(id, presetId)
      .then(dataset => acceptDataset(id, token, dataset, { kind: 'preset', presetId }))
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

  const execute = useCallback((jobs: Array<{ chain: PipelineChainDocument; name: string; choices?: Record<string, number | string | boolean> }>, batch: boolean) => {
    const id = caseId
    const { dataset, config } = workspaces[id]
    if (!dataset || !config || jobs.length === 0) return
    let documents
    // Native candidates carry the document label: keep labels unique within one execution.
    try {
      documents = jobs.map((job, index) => {
        const lab = toLabDocument(dataset, job.chain)
        return { chain: job.chain, name: job.name, choices: job.choices ?? {}, document: lab, lab: jobs.length > 1 ? { ...lab, label: `${lab.label} [${index + 1}]` } : lab }
      })
    }
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
          return match ? [{ id: `run-${++runCounter}`, index: runCounter, name: match.name, choices: match.choices, document: match.document, canonical: toCanonicalPipeline(match.chain),
            candidate, datasetFingerprint: dataset.fingerprint, finishedAt, protocol: { calibrationIds: result.calibrationIds,
            holdoutIds: result.holdoutIds, folds: result.folds, foldsFingerprint: result.foldsFingerprint, validation: result.validation,
            ownerVersions: result.ownerVersions } }] : []
        })
        const refused = result.refusals.map(refusal => refusal.reason)
        patch(id, current => current.dataset !== dataset
          // Another dataset replaced this one during the run: its results never join the new comparison.
          ? { ...current, pipelineNotice: `The dataset changed during the run; its ${records.length} result${records.length === 1 ? ' was' : 's were'} discarded.` }
          : { ...current,
            run: result.candidates.length > 0 ? { kind: 'done' }
              : { kind: 'error', name: 'NativeExecutionRefusal', message: refused.join('; ') || 'No pipeline completed.' },
            results: toWorkbenchResult(result), rawResult: result,
            runs: [...current.runs, ...records],
            pipelineNotice: `${records.length} run${records.length === 1 ? '' : 's'} added to the comparison${batch ? ' (unedited presets)' : ''}.`
              + (refused.length ? ` ${refused.length} refused: ${refused.join('; ')}` : ''),
          })
      })
      .catch(reason => {
        if (runToken.current !== token) return
        const { name, message } = errorStatus(reason)
        patch(id, current => ({ ...current,
          run: name === 'AbortError' ? { kind: 'cancelled', message } : { kind: 'error', name, message } }))
      })
      .finally(() => { if (abortRef.current === controller) abortRef.current = null })
  }, [caseId, patch, workspaces])

  // Each sweep variant is one full run, named after its swept values.
  const variantJobs = useCallback(async (chain: PipelineChainDocument, name: string) =>
    (await expandSweeps(chain, laneLabel)).map(variant => ({ chain: variant.chain, choices: variant.choices,
      name: variant.label ? `${name} · ${variant.label}` : name })), [laneLabel])

  const onRunEdited = useCallback(() => {
    const id = caseId
    const { chain, presetId, basePresetId, presets } = workspaces[id]
    const base = presets.find(preset => preset.id === (presetId ?? basePresetId))?.label
    if (!chain) return
    variantJobs(chain, presetId && base ? base : base ? `Edited ${base}` : 'Edited pipeline')
      .then(jobs => execute(jobs, false))
      .catch(reason => patch(id, current => ({ ...current, pipelineError: errorStatus(reason).message })))
  }, [caseId, execute, patch, variantJobs, workspaces])

  const onRunPresets = useCallback(() => {
    const id = caseId
    Promise.all(workspaces[id].presets.map(preset => variantJobs(preset.document, preset.label)))
      .then(jobs => execute(jobs.flat(), true))
      .catch(reason => patch(id, current => ({ ...current, pipelineError: errorStatus(reason).message })))
  }, [caseId, execute, patch, variantJobs, workspaces])

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

  const running = workspace.run.kind === 'running'
  const progress = workspace.run.kind === 'running' && workspace.run.progress
    ? `${(workspace.run.progress.total ?? 1) > 1 ? `Pipeline ${(workspace.run.progress.completed ?? 0) + 1} of ${workspace.run.progress.total} · ` : ''}${workspace.run.progress.phase} · ${workspace.run.progress.message}`
    : null

  const selectSample = (sampleId: string | null) => patch(caseId, current => ({ ...current, selectedSampleId: sampleId }))
  const dataset = workspace.dataset
  const ready = Boolean(dataset && workspace.config && dataset.caseId === caseId)
  const caseInfo = LAB_CASES.find(info => info.id === caseId)
  const createFromBuilder = (created: LabDataset, fileNames: string[]) => {
    const id = created.caseId
    setCaseId(id)
    acceptDataset(id, ++loadToken.current[id], created, { kind: 'import', profileId: `manifest-${id}`, fileNames })
  }

  return (
    <LabShell runtime={runtime} running={running} revision={`${caseId}:${dataset?.fingerprint ?? ''}:${ready}:${workspace.runs.length}`}>
      <div className="n4mm n4-app n4mm-embedded">
        <main className="n4mm-main">
          <Section id="n4mm-data" step={1} title="Dataset"
            lead="Build the dataset from your files, or load an example. Every source is matched by sample identifier before anything is learned.">
            <DatasetStep
              builder={<DatasetBuilderHost key={caseId} disabled={running} onCreate={createFromBuilder} />}
              examples={dataHost.presets}
              caseTitles={Object.fromEntries(LAB_CASES.map(info => [info.id, info.title]))}
              origin={workspace.origin}
              status={workspace.status}
              disabled={running}
              onLoadExample={preset => { setCaseId(preset.caseId); loadPreset(preset.caseId, preset.id) }}
            />
            {ready && dataset ? <AlignmentTable dataset={asUiDataset(dataset)} /> : null}
          </Section>
          {ready && dataset ? (
            <Section id="n4mm-explore" step={2} title="Explore each source"
              lead="Each source keeps its own axis, unit and representation. Select one sample to follow it everywhere.">
              <SampleNavigator dataset={asUiDataset(dataset)} selectedSampleId={workspace.selectedSampleId} onSelectSample={selectSample} />
              <SourceViews dataset={asUiDataset({ ...dataset, sources: dataset.sources.filter(source => source.representation !== 'series_mv') })}
                selectedSampleId={workspace.selectedSampleId} onSelectSample={selectSample} />
              {dataset.sources.filter(source => source.representation === 'series_mv').map(source =>
                <TimeSeriesView key={source.id} dataset={dataset} source={source} index={dataset.sources.indexOf(source)} selectedSampleId={workspace.selectedSampleId} />)}
            </Section>
          ) : null}
          <Section id="n4mm-case" step={ready ? 3 : 2} title="Analysis"
            lead="The kind of analysis sets the fusion pipelines offered below. Importing files selects the matching kind; each kind keeps its own dataset.">
            <CaseSelector caseId={caseId as MultimodalConfig['caseId']} cases={asUiCases(LAB_CASES)} onCaseChange={id => setCaseId(id)} disabled={running} />
            <p className="n4mm-note" role="status">
              {dataset && dataset.caseId === caseId
                ? <>Dataset of this analysis: <strong>{dataset.name}</strong> ({workspace.origin?.kind === 'import' ? 'your files' : 'example'}, {dataset.sampleIds.length} samples, target {dataset.target.name}).</>
                : `No ${caseInfo?.title.toLowerCase() ?? ''} dataset yet: its example dataset is being loaded.`}
            </p>
          </Section>
          {ready && dataset && workspace.config ? (
            <>
              <Section id="n4mm-protocol" step={4} title="Validation protocol"
                lead="One protocol for every run: the same held-out samples, the same outer folds and the same inner folds.">
                <ValidationPanel dataset={asUiDataset(dataset)} config={workspace.config} onConfigChange={onConfigChange} disabled={running} />
              </Section>
              <Section id="n4mm-pipeline" step={5} title="Build and run the pipeline"
                lead="Pick a fusion preset, then edit it: each source has its own lane; the step after the lanes decides where the sources are fused. Runs accumulate in the comparison below.">
                {workspace.chain ? <>
        <FusionEditor
          dataset={dataset}
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
          variants={pipelineCheck.variants}
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
          <a href="../multimodal-training/nirs4all_multimodal_slides.pdf" download>Download the slides (PDF)</a>
        </nav>
                </> : null}
              </Section>
              <Section id="n4mm-results" step={6} title="Compare results">
                <FusionResults dataset={dataset} runs={workspace.runs} disabled={running}
        onClear={() => patch(caseId, current => ({ ...current, runs: [], results: null, rawResult: null }))}
        onRestore={run => changePipeline(fromCanonicalPipeline(run.canonical))} />
                <ExportPanel hasConfig hasResults={workspace.runs.length > 0} onExportConfig={onExportConfig} onExportResults={onExportResults} />
              </Section>
            </>
          ) : null}
          <Section id="n4mm-guide" step={ready ? 7 : 3} title="Instructor guide">
            <InstructorGuide caseId={caseId as MultimodalConfig['caseId']} cases={asUiCases(LAB_CASES)} />
          </Section>
        </main>
        <footer className="n4mm-footer">
          <p>Computation runs locally in a background worker with the nirs4all WebAssembly owners (IO, Methods, DAG-ML). This page displays their outputs; it does not compute scores itself.</p>
        </footer>
      </div>
    </LabShell>
  )
}
