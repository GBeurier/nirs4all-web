import { useState } from 'react'
import { Boxes, ChevronDown, Database, GitBranch, GripVertical, Play, Settings2, Square, Trash2 } from 'lucide-react'
import type { PipelineDSL, PipelineStep, RunProgress, TaskType } from '@/engine/types'
import { sweepVariantCount } from '@/engine/dagml'
import { nodeByType } from '@/catalog/nodes'
import { Button } from '@/app/components/ui/button'
import { Progress } from '@/app/components/ui/progress'
import { cn } from '@/app/components/ui/utils'
import { DND_NEW_NODE, DND_REORDER, iconByName, paramSummary, phaseLabel } from './_helpers'

export type Selection = { kind: 'step'; id: string } | { kind: 'model' } | { kind: 'cv' }

/** Display-only count of the variants one element contributes (dag-ml is authoritative). */
function elementVariants(step: PipelineStep): number {
  const dims: number[] = []
  if (step.sweeps) for (const s of Object.values(step.sweeps)) {
    const n = sweepVariantCount(s)
    if (n > 1) dims.push(n)
  }
  if (step.variants && step.variants.length > 1) dims.push(step.variants.length)
  return dims.length ? dims.reduce((a, b) => a * b, 1) : 1
}

/** Orange ×N chip shown on a node that defines sweeps/variants. */
function VariantBadge({ step }: { step: PipelineStep }) {
  const n = elementVariants(step)
  if (n <= 1) return null
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded bg-orange-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-orange-600"
      data-node-variant-badge
      title={`${n} variants from this node`}
    >
      <GitBranch className="size-3" />×{n}
    </span>
  )
}

export interface CanvasFlowProps {
  pipeline: PipelineDSL
  taskType: TaskType
  selected: Selection
  running: boolean
  progress: RunProgress | null
  datasetLabel?: string
  onSelect: (sel: Selection) => void
  onInsert: (type: string, index: number) => void
  onMove: (from: number, to: number) => void
  onRemove: (id: string) => void
  onRun: () => void
  onCancel: () => void
}

/** A drop target between/around step cards: accepts palette nodes and reorders. */
function DropZone({ index, onInsert, onMove }: { index: number; onInsert: (type: string, i: number) => void; onMove: (from: number, to: number) => void }) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_NEW_NODE) || e.dataTransfer.types.includes(DND_REORDER)) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation() // don't let the canvas append handler also fire
        setOver(false)
        const newType = e.dataTransfer.getData(DND_NEW_NODE)
        if (newType) return onInsert(newType, index)
        const from = e.dataTransfer.getData(DND_REORDER)
        if (from !== '') onMove(Number(from), index)
      }}
      className={cn(
        'relative mx-auto my-0.5 flex h-3 w-full items-center justify-center transition-all',
        over && 'h-9',
      )}
    >
      <span className={cn('h-px w-full bg-border transition-colors', over && 'bg-brand-teal')} />
      {over && (
        <span className="absolute rounded-full bg-brand-teal px-2 py-0.5 font-mono text-[10px] font-semibold text-white shadow">
          drop here
        </span>
      )}
    </div>
  )
}

/** The connector + node-rank flow line shared by every node row. */
function FlowNode({
  selected,
  accent,
  icon,
  title,
  subtitle,
  badge,
  draggable,
  onDragStart,
  onClick,
  onRemove,
}: {
  selected: boolean
  accent: 'teal' | 'indigo' | 'cyan' | 'slate'
  icon: React.ReactNode
  title: string
  subtitle?: string
  badge?: React.ReactNode
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onClick?: () => void
  onRemove?: () => void
}) {
  const ring =
    accent === 'indigo' ? 'ring-brand-indigo/50' : accent === 'cyan' ? 'ring-brand-cyan/50' : accent === 'slate' ? 'ring-border' : 'ring-brand-teal/50'
  const tint =
    accent === 'indigo' ? 'bg-brand-indigo/10 text-brand-indigo' : accent === 'cyan' ? 'bg-brand-cyan/10 text-brand-cyan' : accent === 'slate' ? 'bg-muted text-muted-foreground' : 'bg-brand-teal/10 text-brand-teal'
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-sm transition-all',
        onClick && 'cursor-pointer hover:shadow-md',
        selected ? `border-transparent ring-2 ${ring}` : 'border-border hover:border-brand-teal/40',
      )}
    >
      {draggable && (
        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/40 transition-colors group-hover:text-muted-foreground active:cursor-grabbing" />
      )}
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tint)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
          {badge}
        </div>
        {subtitle ? <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label="Remove step"
          title="Remove"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  )
}

export function CanvasFlow({
  pipeline,
  taskType,
  selected,
  running,
  progress,
  datasetLabel,
  onSelect,
  onInsert,
  onMove,
  onRemove,
  onRun,
  onCancel,
}: CanvasFlowProps) {
  const modelDef = nodeByType(pipeline.model.type)
  const ModelIcon = iconByName(modelDef?.icon ?? 'Boxes')

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">Pipeline flow</h3>
          <p className="text-[11px] text-muted-foreground">
            {pipeline.steps.length} preprocessing step{pipeline.steps.length === 1 ? '' : 's'} → {modelDef?.name ?? pipeline.model.type}
          </p>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto rounded-xl border border-dashed border-border/70 bg-brand-paper/40 p-4"
        onDragOver={(e) => {
          // allow dropping onto the empty canvas (append)
          if (e.dataTransfer.types.includes(DND_NEW_NODE)) e.preventDefault()
        }}
        onDrop={(e) => {
          const t = e.dataTransfer.getData(DND_NEW_NODE)
          if (t) {
            e.preventDefault()
            onInsert(t, pipeline.steps.length)
          }
        }}
      >
        {/* dataset input source */}
        <FlowNode
          selected={false}
          accent="cyan"
          icon={<Database className="size-4" />}
          title={datasetLabel ?? 'Dataset'}
          subtitle="input spectra"
        />

        {/* preprocessing chain with insert/reorder drop zones */}
        {pipeline.steps.map((step, index) => {
          const def = nodeByType(step.type)
          const Icon = iconByName(def?.icon)
          return (
            <div key={step.id}>
              <DropZone index={index} onInsert={onInsert} onMove={onMove} />
              <FlowNode
                selected={selected.kind === 'step' && selected.id === step.id}
                accent="teal"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_REORDER, String(index))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                icon={<Icon className="size-4" />}
                title={def?.name ?? step.type}
                subtitle={paramSummary(step) || def?.subcategory}
                badge={
                  <span className="flex items-center gap-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{index + 1}</span>
                    <VariantBadge step={step} />
                  </span>
                }
                onClick={() => onSelect({ kind: 'step', id: step.id })}
                onRemove={() => onRemove(step.id)}
              />
            </div>
          )
        })}

        {/* tail drop zone (append / move to end) */}
        <DropZone index={pipeline.steps.length} onInsert={onInsert} onMove={onMove} />

        {pipeline.steps.length === 0 && (
          <p className="py-3 text-center text-[11px] text-muted-foreground">
            Raw spectra feed the model directly — drag an operator here to preprocess.
          </p>
        )}

        {/* terminal model */}
        <FlowNode
          selected={selected.kind === 'model'}
          accent="indigo"
          icon={<ModelIcon className="size-4" />}
          title={modelDef?.name ?? pipeline.model.type}
          subtitle={paramSummary(pipeline.model) || 'estimator'}
          badge={
            <span className="flex items-center gap-1">
              <Boxes className="size-3.5 text-brand-indigo/70" />
              <VariantBadge step={pipeline.model} />
            </span>
          }
          onClick={() => onSelect({ kind: 'model' })}
        />

        {/* cross-validation node */}
        <div className="mt-0.5">
          <span className="mx-auto block h-3 w-px bg-border" />
        </div>
        <FlowNode
          selected={selected.kind === 'cv'}
          accent="slate"
          icon={<Settings2 className="size-4" />}
          title="Cross-validation"
          subtitle={`${pipeline.cv.folds}-fold · seed ${pipeline.cv.seed} · ${taskType}`}
          badge={<ChevronDown className="size-3.5 text-muted-foreground/60" />}
          onClick={() => onSelect({ kind: 'cv' })}
        />
      </div>

      {/* run bar */}
      <div className="mt-4">
        {running && progress ? (
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {phaseLabel(progress.phase)}
                {progress.message ? <span className="ml-1 font-normal text-muted-foreground">— {progress.message}</span> : null}
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm tabular-nums text-muted-foreground">{Math.round(progress.pct)}%</span>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={onCancel}>
                  <Square className="size-3.5" /> Cancel
                </Button>
              </div>
            </div>
            <Progress value={progress.pct} />
          </div>
        ) : (
          <Button size="lg" className="w-full gap-2 shadow-md shadow-brand-teal/20" onClick={onRun}>
            <Play className="size-5" /> Run pipeline
          </Button>
        )}
      </div>
    </div>
  )
}
