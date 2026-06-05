import { useState } from 'react'
import { Boxes, Database, GitBranch, GripVertical, Play, Plus, Settings2, Sparkles, Square, Trash2 } from 'lucide-react'
import type { PipelineDSL, PipelineStep, RunProgress, TaskType } from '@/engine/types'
import { sweepVariantCount } from '@/engine/dagml'
import { nodeByType, SPLIT_NODES } from '@/catalog/nodes'
import { Button } from '@/app/components/ui/button'
import { Progress } from '@/app/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import { cn } from '@/app/components/ui/utils'
import { DND_NEW_NODE, DND_REORDER, iconByName, paramSummary, phaseLabel } from './_helpers'

export type Selection =
  | { kind: 'step'; id: string }
  | { kind: 'model' }
  | { kind: 'split' }
  | { kind: 'cv' }
  /** the branch block; `branchId` is the focused lane new palette ops go into */
  | { kind: 'branch'; branchId?: string }
  | { kind: 'branchStep'; branchId: string; stepId: string }

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
  onAddModel: () => void
  onRemoveModel: () => void
  onAddSplit: (type: string) => void
  onRemoveSplit: () => void
  onAddCv: () => void
  onRemoveCv: () => void
  onAddBranch: () => void
  onRemoveBranch: () => void
  /** add an operator (by catalog type) to a specific branch lane */
  onInsertBranchStep: (branchId: string, type: string) => void
  onRemoveBranchStep: (branchId: string, stepId: string) => void
  onAddBranchLane: () => void
  onRemoveBranchLane: (branchId: string) => void
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
  const ring =
    accent === 'indigo' ? 'ring-brand-indigo/50' : accent === 'cyan' ? 'ring-brand-cyan/50' : accent === 'slate' ? 'ring-border' : 'ring-brand-teal/50'
  const tint =
    accent === 'indigo' ? 'bg-brand-indigo/10 text-brand-indigo' : accent === 'cyan' ? 'bg-brand-cyan/10 text-brand-cyan' : accent === 'slate' ? 'bg-muted text-muted-foreground' : 'bg-brand-teal/10 text-brand-teal'
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

/** A single branch lane: a drop target + a mini preprocessing chain. */
function BranchLane({
  branch,
  selected,
  removable,
  focused,
  onFocusLane,
  onSelectStep,
  onInsertStep,
  onRemoveStep,
  onRemoveLane,
}: {
  branch: { id: string; steps: PipelineStep[] }
  selected: Selection
  removable: boolean
  focused: boolean
  onFocusLane: () => void
  onSelectStep: (stepId: string) => void
  onInsertStep: (type: string) => void
  onRemoveStep: (stepId: string) => void
  onRemoveLane: () => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      data-branch-lane={branch.id}
      onClick={onFocusLane}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_NEW_NODE)) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const t = e.dataTransfer.getData(DND_NEW_NODE)
        if (t) {
          e.preventDefault()
          e.stopPropagation()
          setOver(false)
          onInsertStep(t)
        }
      }}
      className={cn(
        'flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 rounded-lg border bg-card/60 p-2 transition-colors',
        over ? 'border-brand-amber bg-brand-amber/5' : focused ? 'border-brand-amber/60 ring-1 ring-brand-amber/30' : 'border-border/70',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{branch.id}</span>
        {removable && (
          <Button
            variant="ghost"
            size="icon"
            className="size-5 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onRemoveLane}
            aria-label="Remove branch"
            title="Remove branch"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {branch.steps.length === 0 ? (
        <p className="rounded border border-dashed border-border/70 px-2 py-3 text-center text-[10px] text-muted-foreground">drag ops here</p>
      ) : (
        branch.steps.map((s) => {
          const def = nodeByType(s.type)
          const Icon = iconByName(def?.icon)
          const isSel = selected.kind === 'branchStep' && selected.branchId === branch.id && selected.stepId === s.id
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectStep(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectStep(s.id)
                }
              }}
              className={cn(
                'group/bs flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 transition-all',
                isSel ? 'border-transparent ring-2 ring-brand-amber/50' : 'border-border hover:border-brand-amber/40',
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-brand-amber/10 text-brand-amber"><Icon className="size-3" /></span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{def?.name ?? s.type}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/bs:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveStep(s.id)
                }}
                aria-label="Remove branch step"
                title="Remove"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )
        })
      )}
    </div>
  )
}

/** The Branch (feature-union) node: N parallel preprocessing lanes whose outputs
 *  are concatenated column-wise into the model's X. */
function BranchBlockNode({
  branch,
  selected,
  onSelect,
  onFocusLane,
  onSelectStep,
  onInsertStep,
  onRemoveStep,
  onAddLane,
  onRemoveLane,
  onRemove,
}: {
  branch: { branches: { id: string; steps: PipelineStep[] }[] }
  selected: Selection
  onSelect: () => void
  onFocusLane: (branchId: string) => void
  onSelectStep: (branchId: string, stepId: string) => void
  onInsertStep: (branchId: string, type: string) => void
  onRemoveStep: (branchId: string, stepId: string) => void
  onAddLane: () => void
  onRemoveLane: (branchId: string) => void
  onRemove: () => void
}) {
  const focusedLane = selected.kind === 'branch' ? selected.branchId : selected.kind === 'branchStep' ? selected.branchId : undefined
  const isSel = selected.kind === 'branch'
  return (
    <div
      data-branch-node
      className={cn(
        'group relative rounded-xl border bg-card p-2.5 shadow-sm transition-all',
        isSel ? 'border-transparent ring-2 ring-brand-amber/50' : 'border-border',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-amber/10 text-brand-amber"><GitBranch className="size-4" /></span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">Branch · feature union</span>
            <span className="block truncate text-[11px] text-muted-foreground">{branch.branches.length} branches concatenated column-wise → model</span>
          </span>
        </button>
        <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label="Remove branch block" title="Remove branch">
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {branch.branches.map((b) => (
          <BranchLane
            key={b.id}
            branch={b}
            selected={selected}
            removable={branch.branches.length > 2}
            focused={focusedLane === b.id}
            onFocusLane={() => onFocusLane(b.id)}
            onSelectStep={(stepId) => onSelectStep(b.id, stepId)}
            onInsertStep={(type) => onInsertStep(b.id, type)}
            onRemoveStep={(stepId) => onRemoveStep(b.id, stepId)}
            onRemoveLane={() => onRemoveLane(b.id)}
          />
        ))}
        <button
          type="button"
          data-add-branch-lane
          onClick={onAddLane}
          className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-brand-amber/40 bg-brand-amber/5 p-2 text-brand-amber transition-colors hover:border-brand-amber/70 hover:bg-brand-amber/10"
        >
          <Plus className="size-4" />
          <span className="text-[10px] font-semibold">branch</span>
        </button>
      </div>
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
  onAddModel,
  onRemoveModel,
  onAddSplit,
  onRemoveSplit,
  onAddCv,
  onRemoveCv,
  onAddBranch,
  onRemoveBranch,
  onInsertBranchStep,
  onRemoveBranchStep,
  onAddBranchLane,
  onRemoveBranchLane,
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
  const branch = pipeline.branch

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

        {/* optional train/test SPLIT (overrides the dataset partition, before CV) */}
        <div className="mt-0.5"><span className="mx-auto block h-3 w-px bg-border" /></div>
        {split ? (
          <FlowNode
            selected={selected.kind === 'split'}
            accent="cyan"
            icon={<SplitIcon className="size-4" />}
            title={splitDef?.name ?? split.type}
            subtitle={`train / test · ${paramSummary(split) || 'overrides dataset partition'}`}
            badge={<span className="rounded bg-brand-cyan/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-cyan">split 1</span>}
            onClick={() => onSelect({ kind: 'split' })}
            onRemove={onRemoveSplit}
          />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-add-split
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-brand-cyan/40 bg-brand-cyan/5 px-3 py-2 text-left transition-colors hover:border-brand-cyan/70 hover:bg-brand-cyan/10"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-cyan/10 text-brand-cyan">
                  <Plus className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-foreground">Add a train/test split <span className="font-mono text-[9px] font-semibold uppercase tracking-wide text-brand-cyan">· split 1</span></span>
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

        {/* DAG feature-union (OPTIONAL): parallel preprocessing branches whose
            outputs are concatenated column-wise before the model. */}
        <div className="mt-0.5"><span className="mx-auto block h-3 w-px bg-border" /></div>
        {branch ? (
          <BranchBlockNode
            branch={branch}
            selected={selected}
            onSelect={() => onSelect({ kind: 'branch' })}
            onFocusLane={(branchId) => onSelect({ kind: 'branch', branchId })}
            onSelectStep={(branchId, stepId) => onSelect({ kind: 'branchStep', branchId, stepId })}
            onInsertStep={onInsertBranchStep}
            onRemoveStep={onRemoveBranchStep}
            onAddLane={onAddBranchLane}
            onRemoveLane={onRemoveBranchLane}
            onRemove={onRemoveBranch}
          />
        ) : (
          <button
            type="button"
            data-add-branch
            onClick={onAddBranch}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-brand-amber/40 bg-brand-amber/5 px-3 py-2 text-left transition-colors hover:border-brand-amber/70 hover:bg-brand-amber/10"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-amber/10 text-brand-amber">
              <GitBranch className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-foreground">Add a branch (feature union)</span>
              <span className="block truncate text-[10px] text-muted-foreground">optional — fuse ≥2 preprocessing branches column-wise before the model</span>
            </div>
          </button>
        )}

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
                  <Boxes className="size-3.5 text-brand-indigo/70" />
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
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-brand-indigo/40 bg-brand-indigo/5 px-3 py-2.5 text-left transition-colors hover:border-brand-indigo/70 hover:bg-brand-indigo/10"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-indigo/10 text-brand-indigo">
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
      </div>
    </div>
  )
}
