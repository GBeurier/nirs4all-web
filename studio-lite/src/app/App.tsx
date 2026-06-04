import { useCallback, useRef, useState } from 'react'
import { Cpu, Database, FlaskConical, GitBranch, LineChart, ShieldCheck, Sparkles, Upload } from 'lucide-react'
import { DatasetConfigDialog, DatasetUpload, DatasetView } from '@/components/dataset'
import { PipelineBuilder } from '@/components/pipeline'
import { PredictionPanel, ResultsList, ResultsVisualization } from '@/components/results'
import { defaultPipeline } from '@/catalog/build'
import { engine } from '@/engine/client'
import { type DatasetSummary, reencodeTarget, summarize } from '@/data/dataset'
import { loadSampleDataset, type SampleId } from '@/data/samples'
import { downloadRunCsv, downloadRunJson } from '@/lib/download'
import type { Analysis } from '@/data/wasm-io'
import type { DagMlLineage } from '@/engine/dagml'
import type { MaterializedDataset, PipelineDSL, Partition, RunProgress, RunResult, ScoreNode, TaskType } from '@/engine/types'

function Section({
  index,
  title,
  icon,
  tint,
  right,
  children,
}: {
  index: number
  title: string
  icon: React.ReactNode
  tint: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      className="n4a-card n4a-reveal rounded-2xl border border-border bg-card/95 p-6 backdrop-blur-sm sm:p-8"
      style={{ animationDelay: `${Math.min(index, 5) * 70}ms` }}
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 ${tint}`}>{icon}</div>
          <div className="leading-tight">
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Step {index}
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h2>
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

export default function App() {
  const [dataset, setDataset] = useState<MaterializedDataset | null>(null)
  const [summary, setSummary] = useState<DatasetSummary | null>(null)
  const [pipeline, setPipeline] = useState<PipelineDSL>(() => defaultPipeline('regression'))
  const [runs, setRuns] = useState<RunResult[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedScore, setSelectedScore] = useState<ScoreNode | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runTokenRef = useRef(0)

  const adoptDataset = useCallback((ds: MaterializedDataset) => {
    abortRef.current?.abort() // cancel any in-flight run for the previous dataset
    runTokenRef.current++ // invalidate its results if they resolve late
    setDataset(ds)
    setSummary(summarize(ds))
    setPipeline(defaultPipeline(ds.taskType))
    setRuns([])
    setSelectedRunId(null)
    setSelectedScore(null)
    setError(null)
  }, [])

  const onDataset = useCallback(
    (ds: MaterializedDataset, _name: string, a?: Analysis) => {
      adoptDataset(ds)
      setAnalysis(a ?? null)
    },
    [adoptDataset],
  )

  const onLoadSample = useCallback(async (sample?: SampleId) => {
    setBusy(true)
    setError(null)
    try {
      adoptDataset(await loadSampleDataset(sample))
      setAnalysis(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [adoptDataset])

  const applyConfigPatch = useCallback(
    (patch: { targetName?: string; taskType?: TaskType; testFraction?: number }) => {
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
    setRunning(true)
    setError(null)
    setProgress({ phase: 'fit_cv', pct: 0 })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const token = ++runTokenRef.current
    try {
      const result = await engine.run(dataset, pipeline, { signal: ctrl.signal, onProgress: setProgress })
      if (token !== runTokenRef.current) return // dataset/config changed mid-run — drop stale result
      setRuns((r) => [result, ...r])
      setSelectedRunId(result.id)
      setSelectedScore(result.cv)
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setProgress(null)
      abortRef.current = null
    }
  }, [dataset, pipeline])

  const onCancel = useCallback(() => abortRef.current?.abort(), [])

  const onSelect = useCallback((run: RunResult, score: ScoreNode) => {
    setSelectedRunId(run.id)
    setSelectedScore(score)
  }, [])

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null

  return (
    <div className="min-h-screen n4a-app-bg">
      <div className="h-2 n4a-spectrum-strip" />
      <header className="n4a-grid relative overflow-hidden border-b border-border/70">
        <div className="mx-auto max-w-6xl px-6 pb-10 pt-9">
          <div className="flex items-start justify-between gap-6">
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-brand-teal/20">
                  <FlaskConical className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-2xl font-bold tracking-tight text-foreground">nirs4all</span>
                  <span className="rounded-full border border-brand-teal/30 bg-accent px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent-foreground">
                    lite
                  </span>
                </div>
              </div>
              <h1 className="mt-5 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.6rem]">
                Near-infrared modelling,
                <br className="hidden sm:block" /> end-to-end in your browser
                <span className="text-brand-teal"> — for everyone.</span>
              </h1>
              <p className="mt-3 max-w-xl text-base text-muted-foreground">
                Upload spectra, build a pipeline from nirs4all-methods, run it, and read the scores. No install, no
                Python, nothing leaves your machine.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { icon: <ShieldCheck className="h-3.5 w-3.5 text-brand-green" />, label: 'Runs locally · WASM' },
                  { icon: <GitBranch className="h-3.5 w-3.5 text-brand-indigo" />, label: 'PLS · PLS-DA' },
                  { icon: <Database className="h-3.5 w-3.5 text-brand-cyan" />, label: '~58 formats' },
                  { icon: <Cpu className="h-3.5 w-3.5 text-brand-teal" />, label: 'dag-ml ready' },
                ].map((c) => (
                  <span
                    key={c.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-foreground/80 backdrop-blur"
                  >
                    {c.icon}
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
            <a
              href="https://nirs4all.org"
              target="_blank"
              rel="noreferrer"
              className="relative z-10 hidden shrink-0 items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur transition-colors hover:border-brand-teal/40 hover:text-foreground sm:flex"
            >
              <Sparkles className="h-4 w-4 text-brand-cyan" /> nirs4all.org
            </a>
          </div>
        </div>
        {/* decorative floating spectral curve */}
        <svg
          aria-hidden
          className="n4a-float pointer-events-none absolute -right-10 top-2 hidden h-40 w-[34rem] opacity-50 lg:block"
          viewBox="0 0 560 160"
          fill="none"
        >
          <defs>
            <linearGradient id="n4a-wave" x1="0" y1="0" x2="560" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4f46e5" />
              <stop offset="0.5" stopColor="#06b6d4" />
              <stop offset="1" stopColor="#2dd4bf" />
            </linearGradient>
          </defs>
          <path
            d="M0 120 C 60 120, 90 40, 150 44 C 210 48, 230 132, 290 120 C 340 110, 360 30, 410 36 C 460 42, 480 110, 560 86"
            stroke="url(#n4a-wave)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <Section index={1} title="Dataset" icon={<Upload className="h-5 w-5 text-brand-teal" />} tint="bg-accent">
          <DatasetUpload onDataset={onDataset} onLoadSample={onLoadSample} busy={busy} error={error} />
        </Section>

        {dataset && summary && (
          <Section
            index={2}
            title="Explore"
            icon={<Database className="h-5 w-5 text-brand-cyan" />}
            tint="bg-brand-cyan/10"
          >
            <DatasetView ds={dataset} summary={summary} onOpenConfig={() => setConfigOpen(true)} />
            <DatasetConfigDialog open={configOpen} ds={dataset} analysis={analysis} onOpenChange={setConfigOpen} onApply={applyConfigPatch} />
          </Section>
        )}

        {dataset && (
          <Section
            index={3}
            title="Pipeline"
            icon={<GitBranch className="h-5 w-5 text-brand-indigo" />}
            tint="bg-brand-indigo/10"
          >
            <PipelineBuilder
              pipeline={pipeline}
              taskType={dataset.taskType}
              running={running}
              progress={progress}
              onChange={setPipeline}
              onRun={onRun}
              onCancel={onCancel}
            />
          </Section>
        )}

        {runs.length > 0 && (
          <Section
            index={4}
            title="Results"
            icon={<LineChart className="h-5 w-5 text-brand-teal" />}
            tint="bg-accent"
            right={
              <div className="flex items-center gap-2">
                {(() => {
                  const lin = selectedRun?.lineage as DagMlLineage | undefined
                  if (!lin?.compiled && !lin?.executed) return null
                  return (
                    <span className="hidden items-center gap-1.5 rounded-full border border-brand-indigo/30 bg-brand-indigo/5 px-3 py-1 text-xs font-medium text-brand-indigo sm:inline-flex">
                      <Cpu className="h-3.5 w-3.5" /> {lin.executed ? 'executed by dag-ml' : 'compiled by dag-ml'}
                    </span>
                  )
                })()}
                <span className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">{runs.length} runs</span>
              </div>
            }
          >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
              <ResultsList
                runs={runs}
                selectedRunId={selectedRunId}
                selectedScoreId={selectedScore?.id ?? null}
                onSelect={onSelect}
                onExport={(run) => {
                  downloadRunCsv(run)
                  downloadRunJson(run)
                }}
              />
              {selectedRun && selectedScore && <ResultsVisualization run={selectedRun} score={selectedScore} />}
            </div>
          </Section>
        )}

        {selectedRun && (
          <Section
            index={5}
            title="Predict"
            icon={<Sparkles className="h-5 w-5 text-brand-amber" />}
            tint="bg-brand-amber/10"
          >
            <PredictionPanel run={selectedRun} engine={engine} />
          </Section>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-12 pt-4 text-center text-sm text-muted-foreground">
        Powered by{' '}
        <span className="font-mono text-foreground">nirs4all-formats</span> ·{' '}
        <span className="font-mono text-foreground">nirs4all-io</span> ·{' '}
        <span className="font-mono text-foreground">nirs4all-methods</span> ·{' '}
        <span className="font-mono text-foreground">dag-ml</span> — all running locally as WebAssembly.
      </footer>
    </div>
  )
}
