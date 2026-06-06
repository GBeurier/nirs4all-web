import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Cpu,
  Database,
  FlaskConical,
  GitBranch,
  LineChart,
  Loader2,
  Lock,
  Moon,
  Sparkles,
  Sun,
  Upload,
} from 'lucide-react'
import { DatasetConfigDialog, DatasetUpload, DatasetView } from '@/components/dataset'
import { PipelineBuilder } from '@/components/pipeline'
import { migrateLegacyBranch } from '@/components/pipeline/_helpers'
import { PredictionPanel, ResultsList, ResultsVisualization } from '@/components/results'
import { defaultPipeline } from '@/catalog/build'
import { engine } from '@/engine/client'
import { type DatasetSummary, reencodeTarget, summarize } from '@/data/dataset'
import { loadSampleDataset, type SampleId } from '@/data/samples'
import { type LoadedModel, parseN4a } from '@/lib/n4a'
import { applyTheme, loadSession, loadTheme, saveSession, type Theme } from '@/lib/persist'
import { cn } from '@/app/components/ui/utils'
import type { Analysis } from '@/data/wasm-io'
import type { DagMlLineage } from '@/engine/dagml'
import type { MaterializedDataset, PipelineDSL, Partition, RunLogEntry, RunProgress, RunResult, ScoreNode, TaskType } from '@/engine/types'

type StepId = 'dataset' | 'explore' | 'pipeline' | 'results' | 'predict'

const STEPS: { id: StepId; label: string; hint: string; icon: typeof Upload }[] = [
  { id: 'dataset', label: 'Dataset', hint: 'Upload spectra', icon: Upload },
  { id: 'explore', label: 'Explore', hint: 'Inspect & configure', icon: Database },
  { id: 'pipeline', label: 'Pipeline', hint: 'Build & run', icon: GitBranch },
  { id: 'results', label: 'Results', hint: 'Scores & residuals', icon: LineChart },
  { id: 'predict', label: 'Predict', hint: 'New spectra', icon: Sparkles },
]

export default function App() {
  const [dataset, setDataset] = useState<MaterializedDataset | null>(null)
  const [summary, setSummary] = useState<DatasetSummary | null>(null)
  // session restore: the user's edited pipeline + an imported model survive reload.
  // A restored legacy `branch` block is migrated to the `containers` tree model.
  const [pipeline, setPipeline] = useState<PipelineDSL>(() => {
    const restored = loadSession().pipeline
    return restored ? migrateLegacyBranch(restored) : defaultPipeline('regression')
  })
  const [sampleId, setSampleId] = useState<SampleId | null>(null)
  const [runs, setRuns] = useState<RunResult[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedScore, setSelectedScore] = useState<ScoreNode | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [runLog, setRunLog] = useState<RunLogEntry[]>([])
  const [configOpen, setConfigOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loadedModel, setLoadedModel] = useState<LoadedModel | null>(() => loadSession().model ?? null)
  const [step, setStep] = useState<StepId>('dataset')
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const abortRef = useRef<AbortController | null>(null)
  const runTokenRef = useRef(0)

  // apply the persisted light/dark choice to <html> (and on every toggle)
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const adoptDataset = useCallback((ds: MaterializedDataset, opts?: { keepPipeline?: boolean }) => {
    abortRef.current?.abort()
    runTokenRef.current++
    setDataset(ds)
    setSummary(summarize(ds))
    if (!opts?.keepPipeline) setPipeline(defaultPipeline(ds.taskType)) // keep a restored pipeline on session reload
    setRuns([])
    setSelectedRunId(null)
    setSelectedScore(null)
    setError(null)
    setStep('explore') // land on Explore so the user reviews the loaded dataset
  }, [])

  const onDataset = useCallback(
    (ds: MaterializedDataset, _name: string, a?: Analysis) => {
      adoptDataset(ds)
      setSampleId(null) // an uploaded dataset isn't a restorable bundled sample
      setAnalysis(a ?? null)
    },
    [adoptDataset],
  )

  const onLoadSample = useCallback(
    async (sample?: SampleId) => {
      setBusy(true)
      setError(null)
      try {
        adoptDataset(await loadSampleDataset(sample))
        setSampleId(sample ?? 'fruit') // remember which bundled sample, for session restore
        setAnalysis(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [adoptDataset],
  )

  // Restore a previous session's bundled sample (once, on mount), keeping the
  // restored pipeline rather than resetting it to the task default.
  const didRestore = useRef(false)
  useEffect(() => {
    if (didRestore.current) return
    didRestore.current = true
    const sid = loadSession().sampleId
    if (!sid) return
    setBusy(true)
    loadSampleDataset(sid)
      .then((ds) => {
        adoptDataset(ds, { keepPipeline: true })
        setSampleId(sid)
        setStep('pipeline') // land on the editor where the restored pipeline lives
      })
      .catch(() => {/* sample unavailable — start fresh */})
      .finally(() => setBusy(false))
  }, [adoptDataset])

  // Persist the session (pipeline + imported model + active bundled sample).
  useEffect(() => {
    saveSession({ pipeline, model: loadedModel, sampleId })
  }, [pipeline, loadedModel, sampleId])

  const onImportModel = useCallback(async (file: File) => {
    setError(null)
    try {
      const loaded = parseN4a(await file.text())
      setLoadedModel(loaded)
      setStep('predict') // a saved model goes straight to scoring new spectra
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('dataset')
    }
  }, [])

  const applyConfigPatch = useCallback(
    (patch: { targetName?: string; taskType?: TaskType; testFraction?: number }) => {
      // a target/task/partition change invalidates any prior run — abort, drop
      // stale results & their fitted models, and send the user back to the pipeline
      if (patch.taskType !== undefined || patch.testFraction != null) {
        abortRef.current?.abort()
        runTokenRef.current++
        setRuns([])
        setSelectedRunId(null)
        setSelectedScore(null)
        setStep((s) => (s === 'results' || s === 'predict' ? 'pipeline' : s))
      }
      setDataset((prev) => {
        if (!prev) return prev
        const next: MaterializedDataset = { ...prev }
        if (patch.targetName) next.targetName = patch.targetName
        if (patch.taskType && patch.taskType !== prev.taskType) {
          next.taskType = patch.taskType
          const enc = reencodeTarget(prev, patch.taskType)
          next.y = enc.y
          next.classes = enc.classes
          setPipeline(defaultPipeline(patch.taskType))
        }
        if (patch.testFraction != null && !prev.partitions.includes('test')) {
          const cut = Math.floor(prev.nSamples * (1 - patch.testFraction))
          next.partitions = prev.partitions.map((_, i) => (i < cut ? 'train' : 'test') as Partition)
        }
        setSummary(summarize(next))
        return next
      })
    },
    [],
  )

  const onRun = useCallback(async () => {
    if (!dataset) return
    if (!pipeline.model) {
      setError('Add a model to run / score — this pipeline is preprocessing-only.')
      return
    }
    setRunning(true)
    setError(null)
    setProgress({ phase: 'fit_cv', pct: 0 })
    setRunLog([])
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const token = ++runTokenRef.current
    const handleProgress = (p: RunProgress) => {
      setProgress(p)
      setRunLog((prev) => {
        const entry: RunLogEntry = { ts: Date.now(), phase: p.phase, pct: Math.round(p.pct), message: p.message }
        // bounded for huge sweeps; entry 0 is kept — it anchors the relative timestamps
        if (prev.length >= 500) return [prev[0], ...prev.slice(prev.length - 498), entry]
        return [...prev, entry]
      })
    }
    try {
      const result = await engine.run(dataset, pipeline, { signal: ctrl.signal, onProgress: handleProgress })
      if (token !== runTokenRef.current) return
      // Test-only introspection hook (read by tests/generators-smoke.mjs to prove
      // OOF is assembled once per variant, not duplicated ×variantCount).
      ;(window as unknown as { __n4aLastRun?: RunResult }).__n4aLastRun = result
      setRuns((r) => [result, ...r])
      setSelectedRunId(result.id)
      setSelectedScore(result.cv ?? result.refit) // refit-only run has no CV node
      setStep('results')
    } catch (e) {
      if (token === runTokenRef.current && !(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e))
    } finally {
      // only the latest run owns the run-scoped UI state
      if (token === runTokenRef.current) {
        setRunning(false)
        setProgress(null)
      }
      if (abortRef.current === ctrl) abortRef.current = null
    }
  }, [dataset, pipeline])

  const onCancel = useCallback(() => abortRef.current?.abort(), [])

  const onSelect = useCallback((run: RunResult, score: ScoreNode) => {
    setSelectedRunId(run.id)
    setSelectedScore(score)
  }, [])

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null

  const enabled = useMemo<Record<StepId, boolean>>(
    () => ({
      dataset: true,
      explore: !!dataset,
      pipeline: !!dataset,
      results: runs.length > 0,
      predict: !!selectedRun || !!loadedModel,
    }),
    [dataset, runs.length, selectedRun, loadedModel],
  )

  const go = (id: StepId) => {
    if (enabled[id]) setStep(id)
  }

  const lineage = selectedRun?.lineage as DagMlLineage | undefined
  const runEngineLabel = lineage?.executed ? 'executed by dag-ml' : lineage?.compiled ? 'compiled by dag-ml' : null
  const dataServed = lineage?.dataProvider?.status === 'materialized' ? lineage.dataProvider : null
  const dataFallback = lineage?.dataProvider && lineage.dataProvider.status !== 'materialized' ? lineage.dataProvider : null

  return (
    <div className="flex min-h-screen flex-col n4a-app-bg">
      <div className="h-1.5 shrink-0 n4a-spectrum-strip" />

      {/* ── top runtime bar ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-card/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/65">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-brand-teal/30">
            <FlaskConical className="size-4" />
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="n4a-grad-text font-display text-lg font-bold tracking-tight">nirs4all</span>
            <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-accent-foreground">
              studio lite
            </span>
          </div>
        </div>

        {/* active dataset chip — always visible once loaded */}
        {dataset && summary && (
          <div className="ml-2 hidden items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 md:flex">
            <Database className="size-3.5 text-brand-teal" />
            <span className="max-w-[14rem] truncate text-xs font-medium text-foreground">{dataset.targetName || 'dataset'}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {summary.nSamples} samples × {summary.nFeatures} wavelengths
            </span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{dataset.taskType}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {running && (
            <span className="flex items-center gap-1.5 rounded-full border border-brand-teal/30 bg-brand-teal/5 px-2.5 py-1 text-xs font-medium text-brand-teal">
              <Loader2 className="size-3.5 animate-spin" /> running…
            </span>
          )}
          {!running && dataServed && (
            <span
              className="hidden items-center gap-1.5 rounded-full border border-brand-teal/30 bg-brand-teal/5 px-2.5 py-1 text-xs font-medium text-brand-teal lg:flex"
              title={`dag-ml-data ${dataServed.version ?? ''} · schema ${dataServed.fingerprints?.schema?.slice(0, 10) ?? ''}…`}
            >
              <Database className="size-3.5" /> data by dag-ml-data
            </span>
          )}
          {!running && dataFallback && (
            <span
              className="hidden items-center gap-1.5 rounded-full border border-brand-amber/40 bg-brand-amber/5 px-2.5 py-1 text-xs font-medium text-brand-amber lg:flex"
              title={dataFallback.error ? `dag-ml-data unavailable: ${dataFallback.error}` : 'dag-ml-data unavailable'}
            >
              <Database className="size-3.5" /> data: in-memory fallback
            </span>
          )}
          {!running && runEngineLabel && (
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground sm:flex">
              <Cpu className="size-3.5" /> {runEngineLabel}
            </span>
          )}
          <button
            type="button"
            data-theme-toggle
            aria-label="Toggle dark mode"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="flex size-8 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground transition-colors hover:border-brand-teal/40 hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <a
            href="https://nirs4all.org"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-teal/40 hover:text-foreground"
          >
            <Sparkles className="size-3.5 text-brand-teal" /> nirs4all.org
          </a>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── workflow rail ───────────────────────────────────────────── */}
        <nav className="hidden w-60 shrink-0 flex-col border-r border-border/70 bg-sidebar/60 p-3 md:flex">
          <div className="space-y-1">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const isActive = step === s.id
              const isEnabled = enabled[s.id]
              const isDone = isEnabled && !isActive && stepIndex(step) > i
              return (
                <button
                  key={s.id}
                  type="button"
                  data-step={s.id}
                  disabled={!isEnabled}
                  onClick={() => go(s.id)}
                  className={cn(
                    'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
                    isActive
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-brand-teal/30'
                      : isEnabled
                        ? 'text-foreground/80 hover:bg-card/60'
                        : 'cursor-not-allowed text-muted-foreground/50',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                      isActive ? 'bg-primary text-primary-foreground' : isDone ? 'bg-brand-teal/15 text-brand-teal' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isEnabled ? <Icon className="size-4" /> : <Lock className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                      <span className="truncate text-sm font-semibold">{s.label}</span>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">{s.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-auto space-y-3 px-1 pt-4">
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <Cpu className="size-3.5 text-brand-teal" /> Local WASM stack
              </div>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
                formats → io → dag-ml-data → dag-ml + methods
              </p>
              <p className="mt-1.5 text-[10px] text-muted-foreground">Nothing leaves your browser.</p>
            </div>
          </div>
        </nav>

        {/* ── mobile step tabs ────────────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 bg-card/40 px-3 py-2 md:hidden">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                data-step-mobile={s.id}
                disabled={!enabled[s.id]}
                onClick={() => go(s.id)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  step === s.id ? 'bg-primary text-primary-foreground' : enabled[s.id] ? 'bg-muted text-foreground' : 'text-muted-foreground/40',
                )}
              >
                {i + 1}. {s.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto h-full max-w-6xl p-4 sm:p-6">
              <StepPanel
                step={step}
                dataset={dataset}
                summary={summary}
                pipeline={pipeline}
                runs={runs}
                selectedRun={selectedRun}
                selectedScore={selectedScore}
                loadedModel={loadedModel}
                running={running}
                progress={progress}
                runLog={runLog}
                busy={busy}
                error={error}
                analysis={analysis}
                configOpen={configOpen}
                onDataset={onDataset}
                onLoadSample={onLoadSample}
                onImportModel={onImportModel}
                onOpenConfig={() => setConfigOpen(true)}
                onConfigOpenChange={setConfigOpen}
                onApplyConfig={applyConfigPatch}
                onChangePipeline={setPipeline}
                onRun={onRun}
                onCancel={onCancel}
                onSelectScore={onSelect}
                selectedScoreId={selectedScore?.id ?? null}
                onGoPipeline={() => go('pipeline')}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function stepIndex(id: StepId): number {
  return STEPS.findIndex((s) => s.id === id)
}

/** Header + body wrapper for a workbench panel. */
function Panel({ title, subtitle, icon: Icon, right, children }: { title: string; subtitle?: string; icon: typeof Upload; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-brand-teal ring-1 ring-inset ring-brand-teal/15">
            <Icon className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {right}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

function LockedNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
        <Lock className="mx-auto mb-3 size-6 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  )
}

interface StepPanelProps {
  step: StepId
  dataset: MaterializedDataset | null
  summary: DatasetSummary | null
  pipeline: PipelineDSL
  runs: RunResult[]
  selectedRun: RunResult | null
  selectedScore: ScoreNode | null
  loadedModel: LoadedModel | null
  running: boolean
  progress: RunProgress | null
  runLog: RunLogEntry[]
  busy: boolean
  error: string | null
  analysis: Analysis | null
  configOpen: boolean
  selectedScoreId: string | null
  onDataset: (ds: MaterializedDataset, name: string, a?: Analysis) => void
  onLoadSample: (sample?: SampleId) => void
  onImportModel: (file: File) => void
  onOpenConfig: () => void
  onConfigOpenChange: (open: boolean) => void
  onApplyConfig: (patch: { targetName?: string; taskType?: TaskType; testFraction?: number }) => void
  onChangePipeline: (p: PipelineDSL) => void
  onRun: () => void
  onCancel: () => void
  onSelectScore: (run: RunResult, score: ScoreNode) => void
  onGoPipeline: () => void
}

function StepPanel(props: StepPanelProps) {
  const { step, dataset, summary, selectedRun, selectedScore, loadedModel } = props

  if (step === 'dataset') {
    return (
      <Panel title="Dataset" subtitle="Drop spectra or load a sample — decoded and inferred locally by nirs4all-formats + nirs4all-io." icon={Upload}>
        <DatasetUpload onDataset={props.onDataset} onLoadSample={props.onLoadSample} onImportModel={props.onImportModel} busy={props.busy} error={props.error} />
      </Panel>
    )
  }

  if (step === 'explore') {
    if (!dataset || !summary) return <LockedNote>Load a dataset first.</LockedNote>
    return (
      <Panel
        title="Explore"
        subtitle="Spectra, target distribution and dataset health."
        icon={Database}
        right={
          <button
            type="button"
            onClick={props.onGoPipeline}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Build pipeline →
          </button>
        }
      >
        <DatasetView ds={dataset} summary={summary} onOpenConfig={props.onOpenConfig} />
        <DatasetConfigDialog open={props.configOpen} ds={dataset} analysis={props.analysis} onOpenChange={props.onConfigOpenChange} onApply={props.onApplyConfig} />
      </Panel>
    )
  }

  if (step === 'pipeline') {
    if (!dataset) return <LockedNote>Load a dataset first.</LockedNote>
    return (
      <Panel title="Pipeline" subtitle="Compose preprocessing + a model, then run cross-validation." icon={GitBranch}>
        <ErrorBanner error={props.error} />
        <PipelineBuilder
          pipeline={props.pipeline}
          taskType={dataset.taskType}
          running={props.running}
          progress={props.progress}
          runLog={props.runLog}
          onChange={props.onChangePipeline}
          onRun={props.onRun}
          onCancel={props.onCancel}
        />
      </Panel>
    )
  }

  if (step === 'results') {
    if (props.runs.length === 0) return <LockedNote>Run a pipeline to see results.</LockedNote>
    return (
      <Panel
        title="Results"
        subtitle="Refit, cross-validation and per-fold scores. Click a score to inspect residuals."
        icon={LineChart}
        right={<span className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">{props.runs.length} run{props.runs.length === 1 ? '' : 's'}</span>}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <ResultsList runs={props.runs} selectedRunId={selectedRun?.id ?? null} selectedScoreId={props.selectedScoreId} onSelect={props.onSelectScore} />
          {selectedRun && selectedScore && <ResultsVisualization run={selectedRun} score={selectedScore} />}
        </div>
      </Panel>
    )
  }

  // predict — from the selected run's model, or a model imported from a .n4a bundle
  const predictModel = selectedRun ? selectedRun.model : loadedModel?.model
  const predictName = selectedRun ? selectedRun.pipelineName : loadedModel?.name
  if (!predictModel || !predictName) return <LockedNote>Run a pipeline first, or load a saved .n4a model — then predict on new spectra.</LockedNote>
  return (
    <Panel title="Predict" subtitle="Score new spectra with the selected model — drag a CSV in, or load a saved .n4a model." icon={Sparkles}>
      <PredictionPanel model={predictModel} sourceName={predictName} engine={engine} onImportModel={props.onImportModel} />
    </Panel>
  )
}
