import { useMemo, useState } from 'react'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { modelsForTask, PREPROCESSING_NODES, SPLIT_NODES } from '@/catalog/nodes'
import type { NodeDef } from '@/catalog/types'
import type { TaskType } from '@/engine/types'
import { Input } from '@/app/components/ui/input'
import { cn } from '@/app/components/ui/utils'
import { DND_NEW_NODE, iconByName } from './_helpers'

export interface NodePaletteProps {
  onAdd: (type: string) => void
  taskType: TaskType
}

// Human labels + accent per catalog section. Accent drives the section dot + the
// operator icon tint, so each family reads at a glance (no more endless flat list).
const SECTION_META: Record<string, { label: string; accent: string; dot: string }> = {
  scatter: { label: 'Scatter correction', accent: 'text-brand-teal', dot: 'bg-brand-teal' },
  derivative: { label: 'Derivatives', accent: 'text-brand-teal', dot: 'bg-brand-teal-l' },
  baseline: { label: 'Baseline', accent: 'text-brand-teal', dot: 'bg-brand-teal-d' },
  filtering: { label: 'Smoothing & filtering', accent: 'text-brand-cyan', dot: 'bg-brand-cyan' },
  signal: { label: 'Signal transforms', accent: 'text-brand-cyan', dot: 'bg-brand-cyan-d' },
  scaling: { label: 'Scaling', accent: 'text-brand-cyan', dot: 'bg-brand-cyan' },
  split: { label: 'Train / test split', accent: 'text-brand-indigo', dot: 'bg-brand-indigo' },
  model: { label: 'Models', accent: 'text-brand-amber', dot: 'bg-brand-amber' },
}
const sectionLabel = (key: string) => SECTION_META[key]?.label ?? key
const ORDER = ['scatter', 'derivative', 'baseline', 'filtering', 'signal', 'scaling', 'split', 'model']

/**
 * Left rail of the editor: the full operator catalog as a searchable accordion —
 * preprocessing families, train/test splits, and the models valid for the active
 * task. Sections collapse so the (now large) library stays scannable; a search
 * auto-expands every matching family. Adds are routed by the builder per the
 * node's catalog category. Styling echoes the nirs4all-formats demo: uppercase
 * mono eyebrows, pill counts, glass rows, teal/cyan/indigo accents.
 */
export function NodePalette({ onAdd, taskType }: NodePaletteProps) {
  const [q, setQ] = useState('')
  const [openManual, setOpenManual] = useState<Record<string, boolean>>({ scatter: true })

  const models = useMemo(() => modelsForTask(taskType), [taskType])
  const total = PREPROCESSING_NODES.length + SPLIT_NODES.length + models.length

  const sections = useMemo(() => {
    const query = q.trim().toLowerCase()
    const match = (n: NodeDef) =>
      !query ||
      n.name.toLowerCase().includes(query) ||
      n.subcategory?.toLowerCase().includes(query) ||
      n.category.toLowerCase().includes(query) ||
      n.description.toLowerCase().includes(query)
    const byKey = new Map<string, NodeDef[]>()
    const push = (key: string, n: NodeDef) => {
      if (!match(n)) return
      const arr = byKey.get(key) ?? []
      arr.push(n)
      byKey.set(key, arr)
    }
    for (const n of PREPROCESSING_NODES) push(n.subcategory ?? 'preprocessing', n)
    for (const n of SPLIT_NODES) push('split', n)
    for (const n of models) push('model', n)
    return [...byKey.entries()].sort((a, b) => {
      const ia = ORDER.indexOf(a[0])
      const ib = ORDER.indexOf(b[0])
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  }, [q, models])

  const searching = q.trim().length > 0
  const isOpen = (key: string) => (searching ? true : openManual[key] ?? false)
  const toggle = (key: string) => setOpenManual((s) => ({ ...s, [key]: !(s[key] ?? false) }))

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-teal">Operators</span>
          <span className="rounded-full bg-brand-teal/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-teal">{total}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Search, or open a family. Drag onto the pipeline, or click to add.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search operators…" className="h-8 pl-8 text-xs" aria-label="Search operators" />
      </div>

      <div className="-mr-1 flex-1 space-y-1 overflow-y-auto pr-1">
        {sections.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">No operator matches “{q}”.</p>
        ) : (
          sections.map(([key, nodes]) => {
            const meta = SECTION_META[key]
            const open = isOpen(key)
            return (
              <div key={key} className="overflow-hidden rounded-lg border border-border/70 bg-card/40">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-expanded={open}
                  className="group flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-accent/30"
                >
                  <span className={cn('size-1.5 shrink-0 rounded-full', meta?.dot ?? 'bg-muted-foreground')} />
                  <span className={cn('flex-1 truncate font-display text-xs font-semibold', meta?.accent ?? 'text-foreground')}>{sectionLabel(key)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{nodes.length}</span>
                  <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-90')} />
                </button>
                {open && (
                  <div className="space-y-1 px-1.5 pb-1.5">
                    {nodes.map((node) => {
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
                          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/70', meta?.accent ?? 'text-brand-teal')}>
                            <Icon className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{node.name}</span>
                          <Plus className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover/op:text-brand-teal" />
                        </button>
                      )
                    })}
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
