import type { PipelineStep, TaskType } from '@/engine/types'
import type { ParamValue } from '@/catalog/types'
import { modelsForTask, nodeByType, defaultParams } from '@/catalog/nodes'
import { Label } from '@/app/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'
import { ParamField } from './ParamField'
import { iconByName } from './_helpers'

export interface ModelPickerProps {
  model: PipelineStep
  taskType: TaskType
  onChangeType: (type: string, params: Record<string, unknown>) => void
  onChangeParam: (name: string, value: ParamValue) => void
  /** optional per-param renderer (lets the Inspector pair each field with a sweep activator) */
  renderParam?: (def: import('@/catalog/types').ParamDef, value: unknown) => React.ReactNode
}

/** Terminal estimator selector + its parameters. */
export function ModelPicker({ model, taskType, onChangeType, onChangeParam, renderParam }: ModelPickerProps) {
  const models = modelsForTask(taskType)
  const def = nodeByType(model.type)
  const Icon = iconByName(def?.icon)

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="model-select" className="text-xs text-muted-foreground">
          Estimator
        </Label>
        <Select
          value={model.type}
          onValueChange={(type) => onChangeType(type, defaultParams(type))}
        >
          <SelectTrigger id="model-select">
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.type} value={m.type}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {def ? (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">{def.name}</div>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{def.description}</p>
            </div>
          </div>
          {def.params.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {def.params.map((p) =>
                renderParam ? (
                  <div key={p.name}>{renderParam(p, model.params[p.name] ?? p.default)}</div>
                ) : (
                  <ParamField
                    key={p.name}
                    def={p}
                    value={model.params[p.name] ?? p.default}
                    onChange={(v) => onChangeParam(p.name, v)}
                  />
                ),
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
