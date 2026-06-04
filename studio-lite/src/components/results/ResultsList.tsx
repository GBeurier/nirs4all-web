import { useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Cpu, Download, Layers, Loader2, Target } from 'lucide-react'

import type { ResultsListProps } from '@/components/contracts'
import type { Metrics, RunResult, ScoreNode } from '@/engine/types'
import { fmt, metricChips, primaryMetric } from '@/lib/format'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/app/components/ui/collapsible'
import { cn } from '@/app/components/ui/utils'

import { formatDate } from './_helpers'

function StatusIcon({ status }: { status: ScoreNode['status'] }) {
  if (status === 'running') return <Loader2 className="size-4 animate-spin text-brand-cyan" />
  if (status === 'failed') return <AlertCircle className="size-4 text-destructive" />
  return <CheckCircle2 className="size-4 text-brand-teal" />
}

/** Compact metric chips (RMSE/R²/MAE or Acc/F1) rendered from a metrics record. */
function MetricChips({ task, metrics }: { task: RunResult['taskType']; metrics: Metrics }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {metricChips(task).map((c) => (
        <span
          key={c.key}
          className="inline-flex items-baseline gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
        >
          <span className="text-muted-foreground">{c.label}</span>
          <span className="font-mono font-medium text-foreground">{fmt(metrics[c.key])}</span>
        </span>
      ))}
    </div>
  )
}

interface ScoreRowProps {
  run: RunResult
  node: ScoreNode
  selected: boolean
  onSelect: (run: RunResult, node: ScoreNode) => void
  accent: string
  icon: React.ReactNode
  indent?: boolean
  children?: React.ReactNode
}

function ScoreRow({ run, node, selected, onSelect, accent, icon, indent, children }: ScoreRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(run, node)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(run, node)
        }
      }}
      className={cn(
        'w-full cursor-pointer rounded-xl border p-3 text-left transition-all',
        indent && 'ml-3',
        selected
          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', accent)}>
            {icon}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{node.name}</span>
          <StatusIcon status={node.status} />
        </div>
        {children}
      </div>
      <div className="mt-2 pl-8">
        <MetricChips task={run.taskType} metrics={node.metrics} />
      </div>
    </div>
  )
}

function RunCard({
  run,
  selectedRunId,
  selectedScoreId,
  onSelect,
  onExport,
}: {
  run: RunResult
  selectedRunId: string | null
  selectedScoreId: string | null
  onSelect: ResultsListProps['onSelect']
  onExport: ResultsListProps['onExport']
}) {
  const [cvOpen, setCvOpen] = useState(false)
  const pm = primaryMetric(run.taskType)
  const headline = run.cv.metrics[pm.key]
  const isSel = (node: ScoreNode) => run.id === selectedRunId && node.id === selectedScoreId

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      {/* Card header: name, engine, date, headline metric */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">{run.pipelineName}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1 border-brand-indigo/30 text-brand-indigo">
              <Cpu className="size-3" />
              {run.engine}
            </Badge>
            <span>{formatDate(run.createdAt)}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => onExport(run)}>
          <Download className="size-4" />
          Export
        </Button>
      </div>

      {/* Headline CV primary metric */}
      <div className="mb-4 flex items-baseline gap-2 rounded-xl bg-muted/50 px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">CV {pm.label}</span>
        <span className="font-mono text-2xl font-bold text-brand-teal">{fmt(headline)}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {pm.higherIsBetter ? 'higher is better' : 'lower is better'}
        </span>
      </div>

      {/* Score tree */}
      <div className="space-y-2">
        <ScoreRow
          run={run}
          node={run.refit}
          selected={isSel(run.refit)}
          onSelect={onSelect}
          accent="bg-brand-indigo/10 text-brand-indigo"
          icon={<Target className="size-3.5" />}
        />

        <Collapsible open={cvOpen} onOpenChange={setCvOpen}>
          <ScoreRow
            run={run}
            node={run.cv}
            selected={isSel(run.cv)}
            onSelect={onSelect}
            accent="bg-brand-teal/10 text-brand-teal"
            icon={<Layers className="size-3.5" />}
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                {run.folds.length} folds
                {cvOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>
            </CollapsibleTrigger>
          </ScoreRow>

          <CollapsibleContent className="mt-2 space-y-2 border-l-2 border-dashed border-border pl-2">
            {run.folds.map((fold) => (
              <ScoreRow
                key={fold.id}
                run={run}
                node={fold}
                selected={isSel(fold)}
                onSelect={onSelect}
                accent="bg-brand-cyan/10 text-brand-cyan"
                icon={<Layers className="size-3.5" />}
                indent
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

export function ResultsList(props: ResultsListProps) {
  const { runs, selectedRunId, selectedScoreId, onSelect, onExport } = props

  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
        <p className="text-sm font-medium text-muted-foreground">No runs yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Build a pipeline and run it to see scored results here.</p>
      </div>
    )
  }

  // most recent first
  const ordered = [...runs].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  return (
    <div className="space-y-4">
      {ordered.map((run) => (
        <RunCard
          key={run.id}
          run={run}
          selectedRunId={selectedRunId}
          selectedScoreId={selectedScoreId}
          onSelect={onSelect}
          onExport={onExport}
        />
      ))}
    </div>
  )
}
