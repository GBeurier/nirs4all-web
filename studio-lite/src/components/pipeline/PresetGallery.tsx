import { ArrowRight, Sparkles } from 'lucide-react'
import type { Preset } from '@/catalog/types'
import type { TaskType } from '@/engine/types'
import { PRESETS } from '@/catalog/presets'
import { nodeByType } from '@/catalog/nodes'
import { Badge } from '@/app/components/ui/badge'
import { Card, CardContent } from '@/app/components/ui/card'

export interface PresetGalleryProps {
  taskType: TaskType
  onPick: (preset: Preset) => void
}

/** Gallery of ready-to-run pipelines, filtered to the active task type. */
export function PresetGallery({ taskType, onPick }: PresetGalleryProps) {
  const presets = PRESETS.filter((p) => p.task === 'any' || p.task === taskType)

  if (presets.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No presets for the current task type.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {presets.map((preset) => {
        const chain = [...preset.steps.map((s) => s.type), preset.model.type]
        return (
          <Card
            key={preset.id}
            role="button"
            tabIndex={0}
            onClick={() => onPick(preset)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onPick(preset)
              }
            }}
            className="group cursor-pointer gap-4 p-6 transition-all hover:border-brand-teal hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-teal/40 focus-visible:outline-none"
          >
            <CardContent className="flex flex-col gap-3 p-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
                    <Sparkles className="size-4" />
                  </span>
                  <span className="font-semibold text-foreground">{preset.name}</span>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-teal" />
              </div>
              <p className="text-sm leading-snug text-muted-foreground">{preset.description}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {chain.map((type, i) => {
                  const def = nodeByType(type)
                  const isModel = i === chain.length - 1
                  return (
                    <span key={`${type}-${i}`} className="flex items-center gap-1.5">
                      <Badge
                        variant={isModel ? 'default' : 'secondary'}
                        className="font-mono text-[10px]"
                      >
                        {def?.name ?? type}
                      </Badge>
                      {i < chain.length - 1 ? (
                        <ArrowRight className="size-3 text-muted-foreground/60" />
                      ) : null}
                    </span>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
