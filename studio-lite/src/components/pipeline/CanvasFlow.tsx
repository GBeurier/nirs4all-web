import { useEffect, useRef, useState } from 'react'
import { Boxes, Database, GitBranch, GripVertical, Play, Plus, Settings2, Sparkles, Square, Trash2 } from 'lucide-react'
import type { PipelineDSL, PipelineStep, RunLogEntry, RunProgress, TaskType } from '@/engine/types'
import { sweepVariantCount } from '@/engine/dagml'
import { DAG_NODES, nodeByType, SPLIT_NODES } from '@/catalog/nodes'
import { Button } from '@/app/components/ui/button'
import { Progress } from '@/app/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import { cn } from '@/app/components/ui/utils'
import { DND_NEW_NODE, DND_REORDER, iconByName, paramSummary, phaseLabel } from './_helpers'
import { ContainerTree } from './ContainerTree'

export type Selection =
  | { kind: 'step'; id: string }
  | { kind: 'model' }
  | { kind: 'split' }
  | { kind: 'cv' }
  /** a DAG container node; `branchId` is the focused branch new palette ops go into */
  | { kind: 'container'; containerId: string; branchId?: string }
  /** a preprocessing op inside a container's branch */
  | { kind: 'containerStep'; containerId: string; branchId: string; stepId: string }

// exec-log phase chips: short tag + color per RunProgress phase (module-level —
// never re-allocated per row per render)
const LOG_PHASE_TAG: Record<string, string> = {
  preprocess: 'prep', fit_cv: 'cv', select: 'sel', refit: 'fit', predict: 'pred', done: 'done',
}
const LOG_PHASE_COLOR: Record<string, string> = {
  preprocess: 'text-slate-400', fit_cv: 'text-teal-400', select: 'text-orange-400',
  refit: 'text-violet-400', predict: 'text-blue-400', done: 'text-green-400',
}
/** "+1.23s" under a minute, "+1m02s" above — rounded BEFORE the split so the
 *  seconds part can never display as 60. */
function relTime(ts: number, startTs: number): string {
  const secs = (ts - startTs) / 1000
  if (secs < 60) return `+${secs.toFixed(2)}s`
  const s = Math.round(secs)
  return `+${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

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
  runLog: RunLogEntry[]
  datasetLabel?: string
  onSelect: (sel: Selection) => void
  onInsert: (type: string, index: number) => void
  onMove: (from: number, to: number) => void
  onRemove: (id: string) => void
  onAddModel: () => void
  onRemoveModel: () => void
  onAddSplit: (type: string) => void
  onRemoveSplit: () => void
  onAddCv: () => void
  onRemoveCv: () => void
  /** add a DAG container (by its dag-node catalog type) to the tree */
  onAddContainer: (type: string) => void
  onRemoveContainer: (containerId: string) => void
  /** add an operator (by catalog type) to a specific container branch */
  onInsertContainerStep: (containerId: string, branchId: string, type: string) => void
  onRemoveContainerStep: (containerId: string, branchId: string, stepId: string) => void
  onAddContainerBranch: (containerId: string) => void
  onRemoveContainerBranch: (containerId: string, branchId: string) => void
  onSetContainerMode: (containerId: string, mode: 'or' | 'cartesian') => void
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
  testId,
  removeLabel,
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
  /** stable test hook on the node card */
  testId?: string
  /** aria-label for the remove button (defaults to "Remove step") */
  removeLabel?: string
}) {
  // Teal-led chrome (matching the studio): the model is the teal "hero"; the
  // structural spine (dataset / split / cv) reads as cool slate; preprocessing
  // is teal. `indigo`/`cyan` are kept as accent *names* but resolve to teal/slate.
  const ring =
    accent === 'indigo' ? 'ring-brand-teal/50' : accent === 'cyan' ? 'ring-border' : accent === 'slate' ? 'ring-border' : 'ring-brand-teal/50'
  const tint =
    accent === 'indigo' ? 'bg-brand-teal/10 text-brand-teal' : accent === 'cyan' ? 'bg-muted text-muted-foreground' : accent === 'slate' ? 'bg-muted text-muted-foreground' : 'bg-brand-teal/10 text-brand-teal'
  return (
    <div
      {...(testId ? { [`data-${testId}`]: '' } : {})}
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
          aria-label={removeLabel ?? 'Remove step'}
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
  runLog,
  datasetLabel,
  onSelect,
  onInsert,
  onMove,
  onRemove,
  onAddModel,
  onRemoveModel,
  onAddSplit,
  onRemoveSplit,
  onAddCv,
  onRemoveCv,
  onAddContainer,
  onRemoveContainer,
  onInsertContainerStep,
  onRemoveContainerStep,
  onAddContainerBranch,
  onRemoveContainerBranch,
  onSetContainerMode,
  onRun,
  onCancel,
}: CanvasFlowProps) {
  const model = pipeline.model
  const modelDef = model ? nodeByType(model.type) : undefined
  const ModelIcon = iconByName(modelDef?.icon ?? 'Boxes')
  const split = pipeline.split
  const splitDef = split ? nodeByType(split.type) : undefined
  const SplitIcon = iconByName(splitDef?.icon ?? 'Split')
  const cv = pipeline.cv
  const containers = pipeline.containers ?? []

  // Pin the exec log to its latest entry only while the user is already at the
  // bottom — scrolling up to read earlier entries must not be fought. (The
  // effect runs after the DOM grew, so compare against the OLD scrollTop with
  // a tolerance covering the freshly appended row.)
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [runLog])

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">Pipeline flow</h3>
          <p className="text-[11px] text-muted-foreground">
            {pipeline.steps.length} preprocessing step{pipeline.steps.length === 1 ? '' : 's'} → {model ? (modelDef?.name ?? model.type) : 'no model'}
          </p>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto rounded-xl border border-dashed border-border/70 bg-muted/40 p-4"
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

        {/* optional train/test SPLIT (overrides the dataset partition, before CV) */}
        <div className="mt-0.5"><span className="mx-auto block h-3 w-px bg-border" /></div>
        {split ? (
          <FlowNode
            selected={selected.kind === 'split'}
            accent="cyan"
            icon={<SplitIcon className="size-4" />}
            title={splitDef?.name ?? split.type}
            subtitle={`train / test · ${paramSummary(split) || 'overrides dataset partition'}`}
            badge={<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">split 1</span>}
            onClick={() => onSelect({ kind: 'split' })}
            onRemove={onRemoveSplit}
          />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-add-split
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-left transition-colors hover:border-brand-teal/50 hover:bg-muted/70"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Plus className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-foreground">Add a train/test split <span className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">· split 1</span></span>
                  <span className="block truncate text-[10px] text-muted-foreground">optional — overrides the dataset partition before CV</span>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {SPLIT_NODES.map((s) => (
                <DropdownMenuItem key={s.type} onSelect={() => onAddSplit(s.type)} className="flex-col items-start gap-0.5 py-2">
                  <span className="text-sm font-medium text-foreground">{s.name}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{s.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="mt-0.5"><span className="mx-auto block h-3 w-px bg-border" /></div>

        {/* cross-validation (the SECOND split) — OPTIONAL, right after the
            train/test split and BEFORE preprocessing. Absent → refit-only run. */}
        {cv ? (
          <FlowNode
            selected={selected.kind === 'cv'}
            accent="slate"
            icon={<Settings2 className="size-4" />}
            title="Cross-validation"
            subtitle={`${cv.folds}-fold · seed ${cv.seed} · ${taskType}`}
            badge={<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">split 2</span>}
            onClick={() => onSelect({ kind: 'cv' })}
            onRemove={onRemoveCv}
            testId="cv-node"
            removeLabel="Remove cross-validation"
          />
        ) : (
          <button
            type="button"
            data-add-cv
            onClick={onAddCv}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2 text-left transition-colors hover:border-muted-foreground/50 hover:bg-muted/40"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Plus className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-foreground">Add cross-validation <span className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">· split 2</span></span>
              <span className="block truncate text-[10px] text-muted-foreground">optional — without it the run is refit-only (train → score on test)</span>
            </div>
          </button>
        )}
        <div className="mt-0.5"><span className="mx-auto block h-3 w-px bg-border" /></div>

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

        {/* DAG containers (OPTIONAL): a foldable tree of structural / generator
            operators — branch / concat / merge fuse features column-wise; OR /
            Cartesian generators expand variants. Each renders as a collapsible,
            indented sub-tree. */}
        <div className="mt-0.5"><span className="mx-auto block h-3 w-px bg-border" /></div>
        {containers.map((c) => (
          <div key={c.id}>
            <ContainerTree
              container={c}
              selected={selected}
              onSelect={() => onSelect({ kind: 'container', containerId: c.id })}
              onFocusBranch={(branchId) => onSelect({ kind: 'container', containerId: c.id, branchId })}
              onSelectStep={(branchId, stepId) => onSelect({ kind: 'containerStep', containerId: c.id, branchId, stepId })}
              onInsertStep={(branchId, type) => onInsertContainerStep(c.id, branchId, type)}
              onRemoveStep={(branchId, stepId) => onRemoveContainerStep(c.id, branchId, stepId)}
              onAddBranch={() => onAddContainerBranch(c.id)}
              onRemoveBranch={(branchId) => onRemoveContainerBranch(c.id, branchId)}
              onRemove={() => onRemoveContainer(c.id)}
              onSetMode={(mode) => onSetContainerMode(c.id, mode)}
            />
            <div className="mt-0.5"><span className="mx-auto block h-3 w-px bg-border" /></div>
          </div>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-add-container
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-brand-teal/40 bg-brand-teal/5 px-3 py-2 text-left transition-colors hover:border-brand-teal/70 hover:bg-brand-teal/10"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <GitBranch className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-foreground">Add a DAG structure</span>
                <span className="block truncate text-[10px] text-muted-foreground">optional — branch / merge / concat-transform (feature fusion) or an OR / Cartesian generator</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {DAG_NODES.map((d) => (
              <DropdownMenuItem key={d.type} onSelect={() => onAddContainer(d.type)} className="flex-col items-start gap-0.5 py-2">
                <span className="text-sm font-medium text-foreground">{d.name}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{d.description}</span>
              </DropdownMenuItem>
            ))}
            {/* Honest roadmap: the canonical nirs4all-studio flow set also has
                per-source branch/merge + extra generator kinds that need
                multi-source data or ensembling — not yet executable here. */}
            <DropdownMenuSeparator />
            <div data-dag-roadmap className="px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
              <span className="font-mono font-semibold uppercase tracking-wide text-muted-foreground/80">Roadmap</span>
              <p className="mt-0.5">
                Parameter sweeps (range / log&nbsp;range) live on each operator's params; a grid search is just several sweeps combined.
                Source branch / merge predictions (stacking) and the zip / chain / sample generators need multi-source or ensembling — coming soon.
              </p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* terminal model (OPTIONAL) — always last, before CV */}
        {model ? (
          <>
            <FlowNode
              selected={selected.kind === 'model'}
              accent="indigo"
              icon={<ModelIcon className="size-4" />}
              title={modelDef?.name ?? model.type}
              subtitle={modelDef?.autonomous ? 'self-preprocessing · self-tuned' : paramSummary(model) || 'estimator'}
              badge={
                <span className="flex items-center gap-1">
                  {modelDef?.autonomous && (
                    <span title="Screens preprocessing internally and tunes itself" className="flex items-center gap-0.5 rounded-full bg-brand-amber/12 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-brand-amber">
                      <Sparkles className="size-2.5" /> auto
                    </span>
                  )}
                  <Boxes className="size-3.5 text-brand-teal/70" />
                  <VariantBadge step={model} />
                </span>
              }
              onClick={() => onSelect({ kind: 'model' })}
              onRemove={onRemoveModel}
            />
            {modelDef?.autonomous && (pipeline.steps.length > 0 || pipeline.finetune?.enabled) && (
              <div className="mt-1 flex items-start gap-1.5 rounded-lg border border-brand-amber/40 bg-brand-amber/5 px-2.5 py-1.5 text-[10px] leading-snug text-brand-amber">
                <Sparkles className="mt-0.5 size-3 shrink-0" />
                <span>
                  {modelDef.name} screens preprocessing and tunes itself — the
                  {pipeline.steps.length > 0 ? ' preprocessing steps' : ''}
                  {pipeline.steps.length > 0 && pipeline.finetune?.enabled ? ' and' : ''}
                  {pipeline.finetune?.enabled ? ' finetune' : ''} above are redundant.
                </span>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            data-add-model
            onClick={onAddModel}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-brand-teal/40 bg-brand-teal/5 px-3 py-2.5 text-left transition-colors hover:border-brand-teal/70 hover:bg-brand-teal/10"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Plus className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">Add a model</span>
              <span className="block truncate text-[11px] text-muted-foreground">preprocessing-only — add a model to score</span>
            </div>
          </button>
        )}
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
        ) : !model ? (
          <div data-run-guard className="rounded-xl border border-dashed border-brand-amber/50 bg-brand-amber/5 p-3.5 text-center">
            <p className="text-sm font-medium text-brand-amber">Add a model to run / score.</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">This pipeline is preprocessing-only — pick a model to cross-validate and score.</p>
          </div>
        ) : (
          <Button size="lg" className="w-full gap-2 shadow-md shadow-brand-teal/20" onClick={onRun}>
            <Play className="size-5" /> Run pipeline
          </Button>
        )}

        {/* execution log — visible during and after the run until the next run starts */}
        {runLog.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Exec log</p>
            <div
              ref={logRef}
              className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/50 p-2 font-mono text-[10px] leading-relaxed"
              data-run-log
            >
              {runLog.map((e, i) => (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="w-14 shrink-0 text-right text-muted-foreground/70">{relTime(e.ts, runLog[0].ts)}</span>
                  <span className={`w-8 shrink-0 ${LOG_PHASE_COLOR[e.phase] ?? 'text-muted-foreground'}`}>{LOG_PHASE_TAG[e.phase] ?? e.phase.slice(0, 4)}</span>
                  <span className="w-7 shrink-0 text-right tabular-nums text-muted-foreground/70">{e.pct}%</span>
                  {e.message && (
                    <span className="min-w-0 truncate text-foreground/75" title={e.message}>
                      {e.message}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
