import { useMemo, useState } from 'react'
import { ChevronRight, Plus, Search, Sparkles } from 'lucide-react'
import { DAG_NODES, modelsForTask, PREPROCESSING_NODES, SPLIT_NODES } from '@/catalog/nodes'
import type { NodeDef } from '@/catalog/types'
import type { TaskType } from '@/engine/types'
import { Input } from '@/app/components/ui/input'
import { cn } from '@/app/components/ui/utils'
import { DND_NEW_NODE, iconByName } from './_helpers'

export interface NodePaletteProps {
  onAdd: (type: string) => void
  taskType: TaskType
}

// Four top-level buckets, in pipeline order: Split → Preprocessing → Models →
// DAG / structure. The DAG bucket is a normal foldable accordion holding the
// structural + generator operators (Branch / Concat-transform / Merge / OR /
// Cartesian), each a real catalog node added through `onAdd` like any other.
type BucketKey = 'split' | 'preprocessing' | 'model' | 'dag'
// Teal-led palette (matching the studio chrome): the active data path —
// preprocessing, DAG containers, and the model "hero" — is teal; the passive
// train/test split (dataset scaffolding) reads as cool slate.
const BUCKETS: { key: BucketKey; label: string; accent: string; dot: string }[] = [
  { key: 'split', label: 'Train / test split', accent: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  { key: 'preprocessing', label: 'Preprocessings', accent: 'text-brand-teal', dot: 'bg-brand-teal' },
  { key: 'model', label: 'Models', accent: 'text-brand-teal-d', dot: 'bg-brand-teal-d' },
  { key: 'dag', label: 'DAG / structure', accent: 'text-brand-teal', dot: 'bg-brand-teal' },
]
// nice sub-labels for the preprocessing sub-groups
const SUBCAT_LABEL: Record<string, string> = {
  scatter: 'Scatter correction',
  derivative: 'Derivatives',
  baseline: 'Baseline',
  filtering: 'Smoothing & filtering',
  signal: 'Signal transforms',
  scaling: 'Scaling',
  parallel: 'Parallel paths',
  combine: 'Combine',
  generator: 'Generators',
}

/**
 * Left rail of the editor: the operator catalog in three buckets matching the
 * pipeline order — Split, Preprocessings, Models — as a searchable accordion.
 * Preprocessings sub-group by family; self-contained models (AOM/POP) carry an
 * "auto" badge so users don't stack redundant preprocessing on them.
 * Styling echoes the nirs4all-formats demo (mono eyebrows, pill counts, glass).
 */
export function NodePalette({ onAdd, taskType }: NodePaletteProps) {
  const [q, setQ] = useState('')
  const [openManual, setOpenManual] = useState<Record<string, boolean>>({ preprocessing: true, dag: true })

  const models = useMemo(() => modelsForTask(taskType), [taskType])

  const matched = useMemo(() => {
    const query = q.trim().toLowerCase()
    const match = (n: NodeDef) =>
      !query ||
      n.name.toLowerCase().includes(query) ||
      n.subcategory?.toLowerCase().includes(query) ||
      n.category.toLowerCase().includes(query) ||
      n.description.toLowerCase().includes(query)
    return {
      split: SPLIT_NODES.filter(match),
      preprocessing: PREPROCESSING_NODES.filter(match),
      model: models.filter(match),
      dag: DAG_NODES.filter(match),
    } as Record<BucketKey, NodeDef[]>
  }, [q, models])

  const total = SPLIT_NODES.length + PREPROCESSING_NODES.length + models.length + DAG_NODES.length
  const searching = q.trim().length > 0
  const isOpen = (key: string) => (searching ? true : openManual[key] ?? false)
  const toggle = (key: string) => setOpenManual((s) => ({ ...s, [key]: !(s[key] ?? false) }))

  const renderOp = (node: NodeDef, accent: string) => {
    const Icon = iconByName(node.icon)
    return (
      <button
        key={node.type}
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_NEW_NODE, node.type)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={() => onAdd(node.type)}
        title={node.description}
        className={cn(
          'group/op flex w-full cursor-grab items-center gap-2.5 rounded-md border border-transparent bg-background/60 px-2 py-1.5 text-left',
          'transition-all hover:border-brand-teal/40 hover:bg-card hover:shadow-sm active:cursor-grabbing',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40',
        )}
      >
        <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/70', accent)}>
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{node.name}</span>
        {node.autonomous && (
          <span title="Self-preprocessing — no preprocessing steps needed" className="flex shrink-0 items-center gap-0.5 rounded-full bg-brand-amber/12 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-brand-amber">
            <Sparkles className="size-2.5" /> auto
          </span>
        )}
        <Plus className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover/op:text-brand-teal" />
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-teal">Operators</span>
          <span className="rounded-full bg-brand-teal/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-teal">{total}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Split → preprocessings → model → DAG structure. Search, or open a family; drag or click to add.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search operators…" className="h-8 pl-8 text-xs" aria-label="Search operators" />
      </div>

      <div className="-mr-1 flex-1 space-y-1 overflow-y-auto pr-1">
        {BUCKETS.every((b) => matched[b.key].length === 0) ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">No operator matches “{q}”.</p>
        ) : (
          BUCKETS.filter((b) => matched[b.key].length > 0).map((b) => {
            const nodes = matched[b.key]
            const open = isOpen(b.key)
            // preprocessing + dag sub-group by subcategory family with captions
            const grouped = b.key === 'preprocessing' || b.key === 'dag'
            return (
              <div key={b.key} className="overflow-hidden rounded-lg border border-border/70 bg-card/40" {...(b.key === 'dag' ? { 'data-palette-dag': '' } : {})}>
                <button
                  type="button"
                  onClick={() => toggle(b.key)}
                  aria-expanded={open}
                  data-palette-bucket={b.key}
                  className="group flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-accent/30"
                >
                  <span className={cn('size-1.5 shrink-0 rounded-full', b.dot)} />
                  <span className={cn('flex-1 truncate font-display text-xs font-semibold', b.accent)}>{b.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{nodes.length}</span>
                  <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-90')} />
                </button>
                {open && (
                  <div className="space-y-1 px-1.5 pb-1.5">
                    {grouped
                      ? // sub-group by family with light captions
                        Object.entries(
                          nodes.reduce<Record<string, NodeDef[]>>((acc, n) => {
                            const k = n.subcategory ?? 'other'
                            ;(acc[k] ??= []).push(n)
                            return acc
                          }, {}),
                        ).map(([sub, subNodes]) => (
                          <div key={sub} className="space-y-1">
                            <div className="px-1 pt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{SUBCAT_LABEL[sub] ?? sub}</div>
                            {subNodes.map((n) => renderOp(n, b.accent))}
                          </div>
                        ))
                      : nodes.map((n) => renderOp(n, b.accent))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
