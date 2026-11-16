import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MultimodalWorkbench,
  MultimodalPipelineEditor,
  pipelineIssues as pipelineEditingIssues,
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
  type MultimodalPipelineDocument,
} from 'nirs4all-ui/multimodal'
import { downloadJson } from '@/lib/download'
import { createLabClient, defaultLabConfig, type LabClient } from './client'
import { IMPORT_PROFILES, TEACHING_PRESETS, importLabFiles, loadTeachingDataset } from './data'
import { toExecutionConfig, toWorkbenchProgress, toWorkbenchResult } from './presentation'
import type { LabCase, LabConfig, LabDataset, LabRunResult } from './types'
import { DatasetBuilderHost } from './DatasetBuilderHost'
import { createPipelinePresets, pipelineSourceIds, pipelineStrategy, validatePipelineDocument } from './recipes'

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
  runOrigin: 'edited' | 'batch' | null
  pipeline: MultimodalPipelineDocument | null
  pipelineError: string | null
  pipelineNotice: string | null
  history: Array<{ label: string; recipeFingerprint: string; foldsFingerprint: string;
    rmse: number; holdoutRmse: number | null; document: MultimodalPipelineDocument }>
}

const EMPTY_WORKSPACE: CaseWorkspace = {
  dataset: null, origin: null, status: { kind: 'empty' }, config: null, candidates: [],
  selectedSampleId: null, run: { kind: 'idle' }, results: null, rawResult: null,
  pipeline: null, pipelineError: null, pipelineNotice: null, runOrigin: null, history: [],
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

function teachingSetup(dataset: LabDataset): Pick<CaseWorkspace, 'config' | 'candidates' | 'pipeline'> {
  const config = toWorkbenchConfig(defaultLabConfig(dataset))
  const presets = createPipelinePresets(dataset, toExecutionConfig(config))
  return { config, candidates: defaultCandidates(dataset, config.sourceIds),
    pipeline: presets.find(preset => preset.id === 'early')?.document ?? presets[0]?.document ?? null }
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
  return { ...current, results: null, rawResult: null, runOrigin: null, run: { kind: 'idle' } }
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
  const [caseId, setCaseId] = useState<MultimodalCaseId>('spectroscopy')
  const [workspaces, setWorkspaces] = useState<Workspaces>(INITIAL_WORKSPACES)
  const [runtime, setRuntime] = useState<MultimodalRuntimeStatus>(browserRuntime)
  const clientRef = useRef<LabClient | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const loadToken = useRef<Record<MultimodalCaseId, number>>({ spectroscopy: 0, genetics: 0, images: 0 })
  const runToken = useRef(0)
  const workspace = workspaces[caseId]
  const pipelinePresets = useMemo(() => workspace.dataset && workspace.config
    ? createPipelinePresets(workspace.dataset, toExecutionConfig(workspace.config)) : [],
  [workspace.dataset, workspace.config])
  const pipelineProblem = useMemo(() => {
    if (!workspace.dataset || !workspace.pipeline) return 'Load data and a pipeline preset first.'
    try {
      validatePipelineDocument(workspace.dataset, workspace.pipeline)
      return pipelineEditingIssues(workspace.pipeline, workspace.dataset.sources).find(issue => issue.severity === 'error')?.message ?? null
    }
    catch (reason) { return errorStatus(reason).message }
  }, [workspace.dataset, workspace.pipeline])

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

  const onRun = useCallback((edited = false) => {
    const id = caseId
    const { dataset, config, candidates } = workspaces[id]
    if (!dataset || !config || candidates.length === 0) return
    const configs = edited && workspaces[id].pipeline ? [{ ...toExecutionConfig(config),
      pipeline: validatePipelineDocument(dataset, workspaces[id].pipeline),
      sourceIds: pipelineSourceIds(workspaces[id].pipeline!),
      strategy: pipelineStrategy(workspaces[id].pipeline!),
    }] : candidates.map(candidate => toExecutionConfig({
      ...config, strategy: candidate.strategy, singleSourceId: candidate.singleSourceId ?? config.singleSourceId,
    }))
    const token = ++runToken.current
    const controller = new AbortController()
    abortRef.current = controller
    const client = clientRef.current ??= createLabClient()
    patch(id, current => ({ ...invalidate(current), runOrigin: edited ? 'edited' : 'batch', run: { kind: 'running', progress: null } }))
    client.run(dataset, configs, progress => {
      if (runToken.current !== token) return
      const candidateId = edited ? undefined : candidates[progress.candidateIndex]?.id
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
        patch(id, current => ({ ...current, run: result.candidates.length > 0 ? { kind: 'done' }
          : { kind: 'error', name: 'NativeExecutionRefusal',
            message: result.refusals.map(refusal => refusal.reason).join('; ') || 'No pipeline completed.' },
          results: toWorkbenchResult(result), rawResult: result,
          history: edited && configs[0].pipeline ? [...current.history, ...result.candidates.map(candidate => ({
            label: candidate.label, recipeFingerprint: candidate.recipeFingerprint, foldsFingerprint: candidate.foldsFingerprint,
            rmse: candidate.oof.rmse, holdoutRmse: candidate.holdout?.rmse ?? null,
            document: structuredClone(configs[0].pipeline!),
          }))] : current.history }))
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

  const changePipeline = useCallback((pipeline: MultimodalPipelineDocument) => {
    patch(caseId, current => ({ ...invalidate(current), pipeline, pipelineError: null, pipelineNotice: null }))
  }, [caseId, patch])

  const importPipeline = useCallback(async (file: File) => {
    const dataset = workspaces[caseId].dataset
    if (!dataset) return
    try {
      const imported = JSON.parse(await file.text())
      if (imported === null || typeof imported !== 'object' || Array.isArray(imported)
        || Object.keys(imported).some(key => !['schema', 'pipeline', 'sources'].includes(key))) {
        throw new Error('The pipeline file contains unsupported top-level fields.')
      }
      if (imported.schema !== 'nirs4all.multimodal-pipeline.v1') throw new Error('Unsupported pipeline document schema.')
      const pipeline = validatePipelineDocument(dataset, imported.pipeline)
      const expected = datasetMeta(dataset, null).sources
      const matches = Array.isArray(imported.sources) && imported.sources.length === expected.length
        && expected.every(source => imported.sources.some((other: Record<string, unknown>) => other !== null && typeof other === 'object'
          && other.id === source.id && other.modality === source.modality && other.representation === source.representation
          && JSON.stringify(other.shape) === JSON.stringify(source.shape)
          && JSON.stringify(other.axis) === JSON.stringify(source.axis)))
      const pipelineNotice = matches ? null : 'Recipe imported for the current dataset. Its source metadata differs from the exported dataset; inspect the source connections and shapes before running.'
      // Do not attach a file read to a different dataset selected while it was pending.
      patch(caseId, current => current.dataset === dataset
        ? { ...invalidate(current), pipeline, pipelineError: null, pipelineNotice } : current)
    } catch (reason) {
      patch(caseId, current => current.dataset === dataset
        ? { ...current, pipelineError: errorStatus(reason).message } : current)
    }
  }, [caseId, patch, workspaces])

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
      dataset: datasetMeta(dataset, origin),
      config: rawResult.configs.length === 1 && rawResult.configs[0].pipeline ? rawResult.configs[0] : config,
      candidates: rawResult.configs.some(item => item.pipeline)
        ? rawCandidates.map(candidate => ({ id: candidate.id, strategy: candidate.strategy, label: candidate.label })) : candidates,
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
      pipelineEditor={workspace.dataset && workspace.pipeline ? <>
        <MultimodalPipelineEditor sources={workspace.dataset.sources} value={workspace.pipeline}
          onChange={changePipeline} presets={pipelinePresets}
          onLoadPreset={id => { const preset = pipelinePresets.find(item => item.id === id); if (preset) changePipeline(structuredClone(preset.document)) }}
          actions={workspace.run.kind === 'running'
            ? <button type="button" className="n4mm-button" data-variant="danger" onClick={onCancel}>Cancel pipeline</button>
            : <button type="button" className="n4mm-button" data-variant="primary"
              disabled={pipelineProblem !== null || runtime.state !== 'ready'} onClick={() => onRun(true)}>Run edited pipeline</button>}
          disabled={workspace.run.kind === 'running'} onImport={file => { void importPipeline(file) }}
          onExport={() => downloadJson(`${slug(workspace.pipeline!.label)}.pipeline.json`, {
            schema: 'nirs4all.multimodal-pipeline.v1', pipeline: workspace.pipeline,
            sources: datasetMeta(workspace.dataset!, workspace.origin).sources,
          })} />
        <div className="n4mm-pipeline-run" data-edited-pipeline-run>
          <p>Executes the branches, source chains, models and fusion shown above, using the validation protocol selected for this dataset.</p>
          <div role="status" aria-live="polite">
            {workspace.run.kind === 'running' ? <>
              <progress aria-label="Pipeline execution" />
              <span>{workspace.run.progress?.phase ?? 'Preparing'} · {workspace.run.progress?.message ?? 'Starting the local worker…'}</span>
            </> : workspace.run.kind === 'done' ? workspace.runOrigin === 'edited'
              ? 'Pipeline run complete. Native scores are available below.' : 'Preset comparison complete. Native scores are available below.'
              : workspace.run.kind === 'cancelled' ? 'Pipeline cancelled. No partial result is shown.' : null}
          </div>
          {workspace.run.kind === 'error' ? <p role="alert" className="n4mm-alert">{workspace.run.message}</p> : null}
          {pipelineProblem ? <p role="status">{pipelineProblem}</p> : null}
          {workspace.pipelineError ? <p className="n4mm-alert" role="alert">{workspace.pipelineError}</p> : null}
          {workspace.pipelineNotice ? <p className="n4mm-note" role="status">{workspace.pipelineNotice}</p> : null}
        </div>
        {workspace.history.length ? <details className="n4mm-run-history" open>
          <summary>Edited pipeline runs · {workspace.history.length}</summary>
          <p>Each row retains its executed recipe. Compare rows with the same fold fingerprint; editing clears the current result below.</p>
          <div className="n4mm-scroll n4mm-scroll--table" tabIndex={0} role="region" aria-label="Completed pipeline runs"><table className="n4mm-table">
            <caption>Native owner scores for completed edited pipelines</caption>
            <thead><tr><th scope="col">Pipeline</th><th scope="col">OOF RMSE</th><th scope="col">Test RMSE</th><th scope="col">Folds</th><th scope="col">Recipe</th></tr></thead>
            <tbody>{workspace.history.map((item, index) => <tr key={`${index}-${item.recipeFingerprint}`}>
              <th scope="row">{item.label}</th><td>{item.rmse.toPrecision(5)}</td>
              <td>{item.holdoutRmse?.toPrecision(5) ?? 'No test set'}</td><td><code title={item.foldsFingerprint}>{item.foldsFingerprint.slice(0, 12)}</code></td>
              <td><button type="button" className="n4mm-button" disabled={workspace.run.kind === 'running'}
                onClick={() => changePipeline(structuredClone(item.document))}>Restore run {index + 1}</button></td>
            </tr>)}</tbody>
          </table></div>
        </details> : null}
        <nav className="n4mm-training-downloads" aria-label="Training materials">
          <a href="../multimodal-training/nirs4all_multimodal_training.pptx" download>Download the PowerPoint</a>
          <a href="../multimodal-training/nirs4all_multimodal_training.pdf" download>Download the PDF</a>
          <a href="../multimodal-training/demo-guide.html">Open the practical demo guide</a>
        </nav>
      </> : undefined}
      selectedSampleId={workspace.selectedSampleId}
      onSelectSample={sampleId => patch(caseId, current => ({ ...current, selectedSampleId: sampleId }))}
      config={workspace.config}
      onConfigChange={onConfigChange}
      onRestoreTeachingConfig={onRestoreTeachingConfig}
      candidates={workspace.candidates}
      onCandidatesChange={onCandidatesChange}
      run={workspace.run}
      onRun={() => onRun()}
      onCancel={onCancel}
      results={workspace.results}
      onExportConfig={onExportConfig}
      onExportResults={onExportResults}
    />
  )
}
