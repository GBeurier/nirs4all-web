import { GitBranch, Settings2, SlidersHorizontal } from 'lucide-react'
import type { FinetuneSpec, GeneratorMode, ParamSweep, PipelineDSL, PipelineStep, StepVariant, TaskType } from '@/engine/types'
import type { ParamValue } from '@/catalog/types'
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
  onStepParam: (id: string, name: string, value: ParamValue) => void
  onStepSweep: (id: string, param: string, sweep: ParamSweep | undefined) => void
  onStepVariants: (id: string, variants: StepVariant[] | undefined) => void
  onModelType: (type: string, params: Record<string, unknown>) => void
  onModelParam: (name: string, value: ParamValue) => void
  onModelSweep: (param: string, sweep: ParamSweep | undefined) => void
  onModelFinetune: (finetune: FinetuneSpec | undefined) => void
  onSplitParam: (name: string, value: ParamValue) => void
  onCv: (patch: Partial<NonNullable<PipelineDSL['cv']>>) => void
  onContainerStepParam: (containerId: string, branchId: string, stepId: string, name: string, value: ParamValue) => void
  onAddContainerBranch: (containerId: string) => void
  onRemoveContainerBranch: (containerId: string, branchId: string) => void
  onSetContainerMode: (containerId: string, mode: GeneratorMode) => void
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
  onParam: (value: ParamValue) => void
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
export function Inspector({ pipeline, taskType, selected, onStepParam, onStepSweep, onStepVariants, onModelType, onModelParam, onModelSweep, onModelFinetune, onSplitParam, onCv, onContainerStepParam, onAddContainerBranch, onRemoveContainerBranch, onSetContainerMode }: InspectorProps) {
  if (selected.kind === 'split') {
    const split = pipeline.split
    const def = split ? nodeByType(split.type) : undefined
    const Icon = iconByName(def?.icon ?? 'Split')
    if (!split || !def) {
      return (
        <InspectorShell icon={<SlidersHorizontal className="size-4" />} eyebrow="Split" title="No split">
          <p className="text-xs text-muted-foreground">Add a train/test split on the canvas to configure it.</p>
        </InspectorShell>
      )
    }
    return (
      <InspectorShell icon={<Icon className="size-4" />} eyebrow="Train/test split" title={def.name}>
        <p className="text-xs leading-relaxed text-muted-foreground">{def.description}</p>
        <p className="rounded-lg border border-dashed border-brand-cyan/40 bg-brand-cyan/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          This split overrides the dataset's train/test partition. Its test rows are held out of cross-validation and scored by the refit.
        </p>
        {def.params.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {def.params.map((p) => (
              <ParamField key={p.name} def={p} value={split.params[p.name] ?? p.default} onChange={(v) => onSplitParam(p.name, v)} />
            ))}
          </div>
        ) : null}
      </InspectorShell>
    )
  }

  if (selected.kind === 'cv') {
    const cv = pipeline.cv
    if (!cv) {
      return (
        <InspectorShell icon={<Settings2 className="size-4" />} eyebrow="Validation" title="No cross-validation">
          <p className="text-xs text-muted-foreground">This run is refit-only — the pipeline is fit on the train rows and scored on the test partition (or train if none). Add cross-validation on the canvas to estimate generalization with OOF folds.</p>
        </InspectorShell>
      )
    }
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
              value={cv.folds}
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
              value={cv.seed}
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

  if (selected.kind === 'container') {
    const container = pipeline.containers?.find((c) => c.id === selected.containerId)
    const def = container ? nodeByType(container.container === 'generator' ? (container.mode === 'cartesian' ? 'GeneratorCartesian' : 'GeneratorOr') : container.container === 'branch' ? 'Branch' : container.container === 'merge' ? 'Merge' : 'ConcatTransform') : undefined
    if (!container) {
      return (
        <InspectorShell icon={<GitBranch className="size-4" />} eyebrow="DAG" title="No structure">
          <p className="text-xs text-muted-foreground">Add a DAG structure (branch / merge / concat-transform / generator) on the canvas to configure it.</p>
        </InspectorShell>
      )
    }
    const isGenerator = container.container === 'generator'
    const noun = isGenerator ? (container.mode === 'cartesian' ? 'axis' : 'alternative') : 'branch'
    return (
      <InspectorShell icon={<GitBranch className="size-4" />} eyebrow="DAG" title={def?.name ?? container.container}>
        <p className="text-xs leading-relaxed text-muted-foreground">{def?.description}</p>
        {isGenerator && (
          <div className="space-y-1.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Generator mode</span>
            <div className="flex gap-1.5">
              {(['or', 'cartesian'] as GeneratorMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSetContainerMode(container.id, m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${container.mode === m ? 'border-brand-amber bg-brand-amber/10 text-brand-amber' : 'border-border text-muted-foreground hover:border-brand-amber/50'}`}
                >
                  {m === 'cartesian' ? 'Cartesian' : 'OR'}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {container.mode === 'cartesian'
                ? 'Cross-product of axes → every combination becomes a variant. (Execution of Cartesian generators is not wired yet — use OR.)'
                : 'Each alternative is tried as its own variant; dag-ml cross-validates each and selects the best.'}
            </p>
          </div>
        )}
        <div className="space-y-2">
          {container.branches.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[11px] font-semibold text-foreground">{b.id}</span>
                <span className="block text-[10px] text-muted-foreground">{b.steps.length} step{b.steps.length === 1 ? '' : 's'}</span>
              </span>
              {container.branches.length > 2 && (
                <button type="button" className="text-[11px] text-muted-foreground hover:text-destructive" onClick={() => onRemoveContainerBranch(container.id, b.id)}>remove</button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onAddContainerBranch(container.id)}
          className="w-full rounded-lg border border-dashed border-brand-amber/40 bg-brand-amber/5 px-3 py-2 text-xs font-semibold text-brand-amber transition-colors hover:border-brand-amber/70 hover:bg-brand-amber/10"
        >
          + add {noun}
        </button>
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Select an operator in the palette (or drop one onto a branch) to add it to the focused branch. Click a branch op on the canvas to edit its parameters.
        </p>
      </InspectorShell>
    )
  }

  if (selected.kind === 'containerStep') {
    const container = pipeline.containers?.find((c) => c.id === selected.containerId)
    const lane = container?.branches.find((b) => b.id === selected.branchId)
    const step = lane?.steps.find((s) => s.id === selected.stepId)
    const def = step ? nodeByType(step.type) : undefined
    const Icon = iconByName(def?.icon)
    if (!container || !step || !def) {
      return (
        <InspectorShell icon={<SlidersHorizontal className="size-4" />} eyebrow="Branch op" title="Nothing selected">
          <p className="text-xs text-muted-foreground">Select a branch operator on the canvas to edit its parameters.</p>
        </InspectorShell>
      )
    }
    return (
      <InspectorShell icon={<Icon className="size-4" />} eyebrow={`Branch · ${selected.branchId}`} title={def.name}>
        <p className="text-xs leading-relaxed text-muted-foreground">{def.description}</p>
        {def.params.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {def.params.map((p) => (
              <ParamField key={p.name} def={p} value={step.params[p.name] ?? p.default} onChange={(v) => onContainerStepParam(container.id, selected.branchId, selected.stepId, p.name, v)} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">This operator has no parameters.</p>
        )}
      </InspectorShell>
    )
  }

  if (selected.kind === 'model') {
    const model = pipeline.model
    if (!model) {
      return (
        <InspectorShell icon={<SlidersHorizontal className="size-4" />} eyebrow="Estimator" title="No model">
          <p className="text-xs text-muted-foreground">
            This pipeline has no model. Add one on the canvas to fit, cross-validate and score.
          </p>
        </InspectorShell>
      )
    }
    const def = nodeByType(model.type)
    const Icon = iconByName(def?.icon ?? 'Boxes')
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
