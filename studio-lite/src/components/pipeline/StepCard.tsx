import { ArrowDown, ArrowUp, X } from 'lucide-react'
import type { PipelineStep } from '@/engine/types'
import { nodeByType } from '@/catalog/nodes'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { ParamField } from './ParamField'
import { iconByName } from './_helpers'

export interface StepCardProps {
  step: PipelineStep
  index: number
  count: number
  onChangeParam: (name: string, value: number | boolean | string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

/** A single preprocessing step in the linear chain, with its param controls. */
export function StepCard({
  step,
  index,
  count,
  onChangeParam,
  onMoveUp,
  onMoveDown,
  onRemove,
}: StepCardProps) {
  const def = nodeByType(step.type)
  const Icon = iconByName(def?.icon)

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{def?.name ?? step.type}</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {index + 1}/{count}
            </Badge>
          </div>
          {def?.subcategory ? (
            <span className="text-xs capitalize text-muted-foreground">{def.subcategory}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={index === 0}
            onClick={onMoveUp}
            aria-label="Move step up"
            title="Move up"
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={index === count - 1}
            onClick={onMoveDown}
            aria-label="Move step down"
            title="Move down"
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label="Remove step"
            title="Remove"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {def && def.params.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {def.params.map((p) => (
            <ParamField
              key={p.name}
              def={p}
              value={step.params[p.name] ?? p.default}
              onChange={(v) => onChangeParam(p.name, v)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No parameters.</p>
      )}
    </div>
  )
}
