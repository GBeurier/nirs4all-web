import { useState } from 'react'
import { ChevronDown, ChevronRight, Combine, GitBranch, GitMerge, Grid3x3, Plus, Shuffle, Trash2 } from 'lucide-react'
import type { ContainerNode, GeneratorMode, PipelineStep } from '@/engine/types'
import { nodeByType } from '@/catalog/nodes'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/app/components/ui/utils'
import { DND_NEW_NODE, iconByName } from './_helpers'
import { containerVariants } from '@/engine/dagml'
import type { Selection } from './CanvasFlow'

// The FOLDABLE-TREE editor for DAG containers. Ports nirs4all-studio's
// PipelineTree/TreeNode interaction model (a collapsible, indented sub-tree per
// container) trimmed to studio-lite's scope. A container node renders a header +
// a chevron that folds/unfolds its nested branches; each branch is an indented
// lane holding a preprocessing sub-chain. Branch / Concat-transform / Merge fuse
// features column-wise; Generator (OR / Cartesian) expands variants.

const CONTAINER_ICON: Record<ContainerNode['container'], typeof GitBranch> = {
  branch: GitBranch,
  concat_transform: Combine,
  merge: GitMerge,
  generator: Shuffle,
}
const CONTAINER_LABEL: Record<ContainerNode['container'], string> = {
  branch: 'Branch · feature union',
  concat_transform: 'Concat-transform · feature fusion',
  merge: 'Merge · combine outputs',
  generator: 'Generator',
}
/** Per-container "what its branches mean" caption + the add-branch button label. */
function branchNoun(c: ContainerNode): string {
  if (c.container === 'generator') return c.mode === 'cartesian' ? 'axis' : 'alternative'
  return 'branch'
}

export interface ContainerTreeProps {
  container: ContainerNode
  selected: Selection
  onSelect: () => void
  onFocusBranch: (branchId: string) => void
  onSelectStep: (branchId: string, stepId: string) => void
  onInsertStep: (branchId: string, type: string) => void
  onRemoveStep: (branchId: string, stepId: string) => void
  onAddBranch: () => void
  onRemoveBranch: (branchId: string) => void
  onRemove: () => void
  onSetMode: (mode: GeneratorMode) => void
}

/** One indented branch lane inside a container: a drop target + a mini chain. */
function BranchLane({
  branch,
  noun,
  selected,
  containerId,
  removable,
  focused,
  onFocus,
  onSelectStep,
  onInsertStep,
  onRemoveStep,
  onRemove,
}: {
  branch: { id: string; steps: PipelineStep[] }
  noun: string
  selected: Selection
  containerId: string
  removable: boolean
  focused: boolean
  onFocus: () => void
  onSelectStep: (stepId: string) => void
  onInsertStep: (type: string) => void
  onRemoveStep: (stepId: string) => void
  onRemove: () => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      data-branch-lane={branch.id}
      data-container-branch={containerId}
      onClick={(e) => {
        e.stopPropagation()
        onFocus()
      }}
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
        'flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-card/60 p-2 transition-colors',
        over ? 'border-brand-amber bg-brand-amber/5' : focused ? 'border-brand-amber/60 ring-1 ring-brand-amber/30' : 'border-border/70',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{branch.id}</span>
        {removable && (
          <Button variant="ghost" size="icon" className="size-5 shrink-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onRemove() }} aria-label={`Remove ${noun}`} title={`Remove ${noun}`}>
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
          const isSel = selected.kind === 'containerStep' && selected.containerId === containerId && selected.branchId === branch.id && selected.stepId === s.id
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onSelectStep(s.id) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectStep(s.id) } }}
              className={cn(
                'group/bs flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 transition-all',
                isSel ? 'border-transparent ring-2 ring-brand-amber/50' : 'border-border hover:border-brand-amber/40',
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-brand-amber/10 text-brand-amber"><Icon className="size-3" /></span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{def?.name ?? s.type}</span>
              <Button variant="ghost" size="icon" className="size-5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/bs:opacity-100" onClick={(e) => { e.stopPropagation(); onRemoveStep(s.id) }} aria-label="Remove branch step" title="Remove">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )
        })
      )}
    </div>
  )
}

/** A foldable DAG container node: a header (icon + label + variant chip + fold
 *  chevron) over a collapsible, INDENTED column of branch lanes (the nested
 *  sub-pipelines). Generator containers expose an OR/Cartesian mode toggle and a
 *  live variant count. */
export function ContainerTree({
  container,
  selected,
  onSelect,
  onFocusBranch,
  onSelectStep,
  onInsertStep,
  onRemoveStep,
  onAddBranch,
  onRemoveBranch,
  onRemove,
  onSetMode,
}: ContainerTreeProps) {
  const [expanded, setExpanded] = useState(true)
  const Icon = CONTAINER_ICON[container.container]
  const noun = branchNoun(container)
  const isSel = selected.kind === 'container' && selected.containerId === container.id
  const focusedBranch = (selected.kind === 'container' || selected.kind === 'containerStep') && selected.containerId === container.id ? selected.branchId : undefined
  const isGenerator = container.container === 'generator'
  const variants = containerVariants(container)
  const label =
    container.container === 'generator'
      ? `Generator: ${container.mode === 'cartesian' ? 'Cartesian' : 'OR'}`
      : CONTAINER_LABEL[container.container]
  const caption =
    isGenerator
      ? `${container.branches.length} ${noun}${container.branches.length === 1 ? '' : 's'} → ${variants} variant${variants === 1 ? '' : 's'} (dag-ml selects)`
      : `${container.branches.length} branches concatenated column-wise → model`

  return (
    <div
      data-container-node={container.id}
      data-container-kind={container.container}
      className={cn(
        'group relative rounded-xl border bg-card p-2.5 shadow-sm transition-all',
        isSel ? 'border-transparent ring-2 ring-brand-amber/50' : 'border-border',
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          data-container-fold={container.id}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-brand-amber"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-amber/10 text-brand-amber"><Icon className="size-4" /></span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="block truncate text-sm font-semibold text-foreground">{label}</span>
              {isGenerator && variants > 1 && (
                <span className="inline-flex items-center gap-0.5 rounded bg-orange-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-orange-600" data-container-variant-badge title={`${variants} variants from this generator`}>
                  ×{variants}
                </span>
              )}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">{caption}</span>
          </span>
        </button>
        <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label={`Remove ${label}`} title="Remove">
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* generator mode toggle */}
      {isGenerator && expanded && (
        <div className="mb-2 ml-6 flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">mode</span>
          {(['or', 'cartesian'] as GeneratorMode[]).map((m) => (
            <button
              key={m}
              type="button"
              data-generator-mode={m}
              onClick={(e) => { e.stopPropagation(); onSetMode(m) }}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                container.mode === m ? 'border-brand-amber bg-brand-amber/10 text-brand-amber' : 'border-border text-muted-foreground hover:border-brand-amber/50',
              )}
            >
              {m === 'cartesian' ? <Grid3x3 className="size-2.5" /> : <Shuffle className="size-2.5" />}
              {m === 'cartesian' ? 'Cartesian' : 'OR'}
            </button>
          ))}
        </div>
      )}

      {/* nested branches — the foldable, indented sub-tree */}
      {expanded && (
        <div className="ml-3 space-y-1.5 border-l-2 border-brand-amber/20 pl-3">
          {container.branches.map((b) => (
            <BranchLane
              key={b.id}
              branch={b}
              noun={noun}
              selected={selected}
              containerId={container.id}
              removable={container.branches.length > 2}
              focused={focusedBranch === b.id}
              onFocus={() => onFocusBranch(b.id)}
              onSelectStep={(stepId) => onSelectStep(b.id, stepId)}
              onInsertStep={(type) => onInsertStep(b.id, type)}
              onRemoveStep={(stepId) => onRemoveStep(b.id, stepId)}
              onRemove={() => onRemoveBranch(b.id)}
            />
          ))}
          <button
            type="button"
            data-add-branch-lane
            onClick={(e) => { e.stopPropagation(); onAddBranch() }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-amber/40 bg-brand-amber/5 px-2 py-1.5 text-brand-amber transition-colors hover:border-brand-amber/70 hover:bg-brand-amber/10"
          >
            <Plus className="size-3.5" />
            <span className="text-[10px] font-semibold">add {noun}</span>
          </button>
        </div>
      )}
    </div>
  )
}
