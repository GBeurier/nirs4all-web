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
import { downloadJson } from '@/lib/download'
import { createLabClient, defaultLabConfig, type LabClient } from './client'
import { IMPORT_PROFILES, TEACHING_PRESETS, importLabFiles, loadTeachingDataset } from './data'
import { toExecutionConfig, toWorkbenchProgress, toWorkbenchResult } from './presentation'
import type { LabCase, LabConfig, LabDataset, LabRunResult } from './types'
import { DatasetBuilderHost } from './DatasetBuilderHost'

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
}

const EMPTY_WORKSPACE: CaseWorkspace = {
  dataset: null, origin: null, status: { kind: 'empty' }, config: null, candidates: [],
  selectedSampleId: null, run: { kind: 'idle' }, results: null, rawResult: null,
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

function teachingSetup(dataset: LabDataset): Pick<CaseWorkspace, 'config' | 'candidates'> {
  const config = toWorkbenchConfig(defaultLabConfig(dataset))
  return { config, candidates: defaultCandidates(dataset, config.sourceIds) }
}

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

/** Every edit to data, configuration or candidates clears the previous results. */
function invalidate(current: CaseWorkspace): CaseWorkspace {
  return { ...current, results: null, rawResult: null, run: { kind: 'idle' } }
}

function datasetMeta(dataset: LabDataset, origin: MultimodalDataOrigin | null) {
  return {
    caseId: dataset.caseId, name: dataset.name, fingerprint: dataset.fingerprint, origin,
    samples: dataset.sampleIds.length,
    sources: dataset.sources.map(source => ({
      id: source.id, label: source.label, modality: source.modality, representation: source.representation, shape: source.shape,
      axis: source.axis ? { unit: source.axis.unit, kind: source.axis.kind, first: source.axis.values[0],
        last: source.axis.values[source.axis.values.length - 1], points: source.axis.values.length } : null,
    })),
    alignment: dataset.alignment,
  }
}

export default function MultimodalApp() {
  const [caseId, setCaseId] = useState<MultimodalCaseId>('spectroscopy')
  const [workspaces, setWorkspaces] = useState<Workspaces>(INITIAL_WORKSPACES)
  const [runtime, setRuntime] = useState<MultimodalRuntimeStatus>(browserRuntime)
  const clientRef = useRef<LabClient | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const loadToken = useRef<Record<MultimodalCaseId, number>>({ spectroscopy: 0, genetics: 0, images: 0 })
  const runToken = useRef(0)
  const workspace = workspaces[caseId]

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
    patch(id, () => ({ ...EMPTY_WORKSPACE, dataset, origin, status: { kind: 'ready' }, ...teachingSetup(dataset),
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

  // ---- configuration (every edit invalidates results) ----------------------

  const onConfigChange = useCallback((next: MultimodalConfig) => {
    patch(caseId, current => ({ ...invalidate(current), config: next }))
  }, [caseId, patch])

  const onCandidatesChange = useCallback((next: readonly MultimodalCandidate[]) => {
    patch(caseId, current => ({ ...invalidate(current), candidates: next }))
  }, [caseId, patch])

  const onRestoreTeachingConfig = useCallback(() => {
    patch(caseId, current => current.dataset ? { ...invalidate(current), ...teachingSetup(current.dataset) } : current)
  }, [caseId, patch])

  // ---- execution ----------------------------------------------------------

  const onRun = useCallback(() => {
    const id = caseId
    const { dataset, config, candidates } = workspaces[id]
    if (!dataset || !config || candidates.length === 0) return
    const configs = candidates.map(candidate => toExecutionConfig({
      ...config, strategy: candidate.strategy, singleSourceId: candidate.singleSourceId ?? config.singleSourceId,
    }))
    const token = ++runToken.current
    const controller = new AbortController()
    abortRef.current = controller
    const client = clientRef.current ??= createLabClient()
    patch(id, current => ({ ...invalidate(current), run: { kind: 'running', progress: null } }))
    client.run(dataset, configs, progress => {
      if (runToken.current !== token) return
      const candidateId = candidates[progress.candidateIndex]?.id
      patch(id, current => current.run.kind === 'running'
        ? { ...current, run: { kind: 'running', progress: { ...toWorkbenchProgress(progress), ...(candidateId ? { candidateId } : {}) } } }
        : current)
    }, controller.signal)
      .then(result => {
        if (runToken.current !== token) return
        const versions = Object.entries(result.ownerVersions)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .map(([name, version]) => ({ name, version }))
        setRuntime({ state: 'ready', label: 'Local WASM runtime ready', detail: versions.map(v => `${v.name} ${v.version}`).join(' · '), versions })
        patch(id, current => ({ ...current, run: { kind: 'done' }, results: toWorkbenchResult(result), rawResult: result }))
      })
      .catch(reason => {
        if (runToken.current !== token) return
        const { name, message } = errorStatus(reason)
        patch(id, current => ({ ...current, results: null, rawResult: null,
          run: name === 'AbortError' ? { kind: 'cancelled', message } : { kind: 'error', name, message } }))
      })
      .finally(() => { if (abortRef.current === controller) abortRef.current = null })
  }, [caseId, patch, workspaces])

  const onCancel = useCallback(() => { abortRef.current?.abort() }, [])

  // ---- exports ------------------------------------------------------------

  const onExportConfig = useCallback(() => {
    const { dataset, origin, config, candidates } = workspaces[caseId]
    if (!dataset || !config) return
    downloadJson(`${slug(dataset.name)}.lab-config.json`, {
      schema: 'nirs4all.multimodal-lab.config.v1', exportedAt: new Date().toISOString(),
      dataset: datasetMeta(dataset, origin), config, candidates,
      note: 'Fixed a priori teaching settings. This file documents an experiment; it is not an executable .n4a model.',
    })
  }, [caseId, workspaces])

  const onExportResults = useCallback(() => {
    const { dataset, origin, config, candidates, rawResult } = workspaces[caseId]
    if (!dataset || !rawResult) return
    // Portable predictor packages are omitted: they may embed training rows and need explicit consent elsewhere.
    const { candidates: rawCandidates, ...run } = rawResult
    downloadJson(`${slug(dataset.name)}.lab-results.json`, {
      schema: 'nirs4all.multimodal-lab.results.v1', exportedAt: new Date().toISOString(),
      dataset: datasetMeta(dataset, origin), config, candidates,
      run: { ...run, candidates: rawCandidates.map(({ portablePackageJson: _omitted, ...candidate }) => candidate) },
      note: 'Scores computed by the native owners. OOF and held-out scopes are separate; portable predictor packages omitted.',
    })
  }, [caseId, workspaces])

  // ---- render -------------------------------------------------------------

  const brand = useMemo(() => <img src={BRAND_SRC} alt="nirs4all" width={40} height={40} draggable={false} />, [])

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
      datasetBuilder={<DatasetBuilderHost key={caseId} caseId={caseId} disabled={workspace.run.kind === 'running'}
        onCreate={(dataset, fileNames) => acceptDataset(caseId, ++loadToken.current[caseId], dataset,
          { kind: 'import', profileId: `manifest-${caseId}`, fileNames })} />}
      selectedSampleId={workspace.selectedSampleId}
      onSelectSample={sampleId => patch(caseId, current => ({ ...current, selectedSampleId: sampleId }))}
      config={workspace.config}
      onConfigChange={onConfigChange}
      onRestoreTeachingConfig={onRestoreTeachingConfig}
      candidates={workspace.candidates}
      onCandidatesChange={onCandidatesChange}
      run={workspace.run}
      onRun={onRun}
      onCancel={onCancel}
      results={workspace.results}
      onExportConfig={onExportConfig}
      onExportResults={onExportResults}
    />
  )
}
