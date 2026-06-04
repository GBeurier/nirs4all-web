import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { PREPROCESSING_NODES } from '@/catalog/nodes'
import type { NodeDef } from '@/catalog/types'
import { Input } from '@/app/components/ui/input'
import { cn } from '@/app/components/ui/utils'
import { DND_NEW_NODE, iconByName } from './_helpers'

export interface NodePaletteProps {
  onAdd: (type: string) => void
}

/**
 * Left rail of the editor: the catalog of preprocessing operators, searchable
 * and draggable onto the canvas (or click-to-append). Mirrors studio's
 * StepPalette in spirit, scoped to the exported nirs4all-methods nodes.
 */
export function NodePalette({ onAdd }: NodePaletteProps) {
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase()
    const match = (n: NodeDef) =>
      !query ||
      n.name.toLowerCase().includes(query) ||
      n.subcategory?.toLowerCase().includes(query) ||
      n.description.toLowerCase().includes(query)
    const byCat = new Map<string, NodeDef[]>()
    for (const n of PREPROCESSING_NODES) {
      if (!match(n)) continue
      const key = n.subcategory ?? 'other'
      const arr = byCat.get(key) ?? []
      arr.push(n)
      byCat.set(key, arr)
    }
    return [...byCat.entries()]
  }, [q])

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-semibold text-foreground">Operators</span>
          <span className="rounded-full bg-brand-teal/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-teal">
            {PREPROCESSING_NODES.length}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Drag onto the pipeline, or click to add.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search operators…"
          className="h-8 pl-8 text-xs"
          aria-label="Search operators"
        />
      </div>

      <div className="-mr-1 flex-1 space-y-3 overflow-y-auto pr-1">
        {groups.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">No operator matches “{q}”.</p>
        ) : (
          groups.map(([cat, nodes]) => (
            <div key={cat} className="space-y-1.5">
              <div className="px-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                {cat}
              </div>
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
                      'group flex w-full cursor-grab items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left',
                      'transition-all hover:border-brand-teal/50 hover:bg-accent/40 hover:shadow-sm active:cursor-grabbing',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40',
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-teal/10 text-brand-teal">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">{node.name}</span>
                    </span>
                    <Plus className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-brand-teal" />
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
