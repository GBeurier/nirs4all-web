import { Settings2, SlidersHorizontal } from 'lucide-react'
import type { FinetuneSpec, ParamSweep, PipelineDSL, PipelineStep, StepVariant, TaskType } from '@/engine/types'
import { nodeByType } from '@/catalog/nodes'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { ParamField } from './ParamField'
import { ModelPicker } from './ModelPicker'
import { SweepPopover } from './SweepPopover'
import { StepVariantsEditor } from './StepVariantsEditor'
import { FinetunePanel } from './FinetunePanel'
import { iconByName } from './_helpers'
import type { Selection } from './CanvasFlow'

export interface InspectorProps {
  pipeline: PipelineDSL
  taskType: TaskType
  selected: Selection
  onStepParam: (id: string, name: string, value: number | boolean | string) => void
  onStepSweep: (id: string, param: string, sweep: ParamSweep | undefined) => void
  onStepVariants: (id: string, variants: StepVariant[] | undefined) => void
  onModelType: (type: string, params: Record<string, unknown>) => void
  onModelParam: (name: string, value: number | boolean | string) => void
  onModelSweep: (param: string, sweep: ParamSweep | undefined) => void
  onModelFinetune: (finetune: FinetuneSpec | undefined) => void
  onCv: (patch: Partial<PipelineDSL['cv']>) => void
}

/** A numeric ParamField paired with its sweep activator (orange Repeat badge). */
function SweepableParamField({
  step,
  param,
  value,
  numeric,
  onParam,
  onSweep,
}: {
  step: PipelineStep
  param: { name: string; type: string }
  value: unknown
  numeric: boolean
  onParam: (value: number | boolean | string) => void
  onSweep: (sweep: ParamSweep | undefined) => void
}) {
  const def = nodeByType(step.type)?.params.find((p) => p.name === param.name)
  if (!def) return null
  // sweeps target numeric params + select/categorical (via the discrete `or` mode)
  const sweepable = numeric || def.type === 'select'
  return (
    <div className="flex items-end gap-1.5">
      <div className="min-w-0 flex-1">
        <ParamField def={def} value={value} onChange={onParam} />
      </div>
      {sweepable ? (
        <SweepPopover paramKey={param.name} currentValue={value} sweep={step.sweeps?.[param.name]} onSweepChange={onSweep} />
      ) : null}
    </div>
  )
}

function InspectorShell({ icon, eyebrow, title, children }: { icon: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2.5 border-b border-border pb-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-indigo/10 text-brand-indigo">{icon}</span>
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</div>
          <h3 className="font-display text-sm font-semibold leading-tight text-foreground">{title}</h3>
        </div>
      </div>
      <div className="-mr-1 flex-1 space-y-4 overflow-y-auto pr-1">{children}</div>
    </div>
  )
}

/** Right rail of the editor: parameters for whatever node is selected on the canvas. */
export function Inspector({ pipeline, taskType, selected, onStepParam, onStepSweep, onStepVariants, onModelType, onModelParam, onModelSweep, onModelFinetune, onCv }: InspectorProps) {
  if (selected.kind === 'cv') {
    return (
      <InspectorShell icon={<Settings2 className="size-4" />} eyebrow="Validation" title="Cross-validation">
        <p className="text-xs leading-relaxed text-muted-foreground">
          K-fold validation drives model selection and the reported scores. Preprocessing is fit on each training fold only —
          no leakage into validation.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cv-folds" className="text-xs text-muted-foreground">Folds</Label>
            <Input
              id="cv-folds"
              type="number"
              className="h-9 font-mono"
              min={2}
              max={10}
              value={pipeline.cv.folds}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value))
                if (Number.isFinite(v)) onCv({ folds: Math.min(10, Math.max(2, v)) })
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cv-seed" className="text-xs text-muted-foreground">Random seed</Label>
            <Input
              id="cv-seed"
              type="number"
              className="h-9 font-mono"
              value={pipeline.cv.seed}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value))
                if (Number.isFinite(v)) onCv({ seed: v })
              }}
            />
          </div>
        </div>
      </InspectorShell>
    )
  }

  if (selected.kind === 'model') {
    const def = nodeByType(pipeline.model.type)
    const Icon = iconByName(def?.icon ?? 'Boxes')
    const model = pipeline.model
    return (
      <InspectorShell icon={<Icon className="size-4" />} eyebrow="Estimator" title={def?.name ?? model.type}>
        <Tabs defaultValue="model" className="flex h-full flex-col">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="model">Model</TabsTrigger>
            <TabsTrigger value="tune" data-tune-tab>Tune</TabsTrigger>
          </TabsList>
          <TabsContent value="model" className="mt-3 space-y-3">
            {def ? <p className="text-xs leading-relaxed text-muted-foreground">{def.description}</p> : null}
            <ModelPicker
              model={model}
              taskType={taskType}
              onChangeType={onModelType}
              onChangeParam={onModelParam}
              renderParam={(p, value) => (
                <div className="flex items-end gap-1.5">
                  <div className="min-w-0 flex-1">
                    <ParamField def={p} value={value} onChange={(v) => onModelParam(p.name, v)} />
                  </div>
                  {p.type === 'int' || p.type === 'float' || p.type === 'select' ? (
                    <SweepPopover paramKey={p.name} currentValue={value} sweep={model.sweeps?.[p.name]} onSweepChange={(sweep) => onModelSweep(p.name, sweep)} />
                  ) : null}
                </div>
              )}
            />
          </TabsContent>
          <TabsContent value="tune" className="mt-3">
            <FinetunePanel model={model} finetune={pipeline.finetune} onChange={onModelFinetune} />
          </TabsContent>
        </Tabs>
      </InspectorShell>
    )
  }

  // step
  const step = pipeline.steps.find((s) => s.id === selected.id)
  const def = step ? nodeByType(step.type) : undefined
  const Icon = iconByName(def?.icon)
  if (!step || !def) {
    return (
      <InspectorShell icon={<SlidersHorizontal className="size-4" />} eyebrow="Inspector" title="Nothing selected">
        <p className="text-xs text-muted-foreground">Select a node on the canvas to edit its parameters.</p>
      </InspectorShell>
    )
  }
  return (
    <InspectorShell icon={<Icon className="size-4" />} eyebrow={def.subcategory ?? 'Preprocessing'} title={def.name}>
      <p className="text-xs leading-relaxed text-muted-foreground">{def.description}</p>
      {def.params.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {def.params.map((p) => (
            <SweepableParamField
              key={p.name}
              step={step}
              param={p}
              value={step.params[p.name] ?? p.default}
              numeric={p.type === 'int' || p.type === 'float'}
              onParam={(v) => onStepParam(step.id, p.name, v)}
              onSweep={(sweep) => onStepSweep(step.id, p.name, sweep)}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          This operator has no parameters.
        </p>
      )}
      <div className="border-t border-border pt-3">
        <StepVariantsEditor step={step} onChange={(variants) => onStepVariants(step.id, variants)} />
      </div>
    </InspectorShell>
  )
}
