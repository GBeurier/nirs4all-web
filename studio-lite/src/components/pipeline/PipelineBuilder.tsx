import { useRef, useState } from 'react'
import { Download, Sparkles, Upload } from 'lucide-react'
import type { PipelineBuilderProps } from '@/components/contracts'
import type { Preset } from '@/catalog/types'
import type { FinetuneSpec, ParamSweep, PipelineDSL, PipelineStep, StepVariant } from '@/engine/types'
import { countVariants } from '@/engine/dagml'
import { PRESETS } from '@/catalog/presets'
import { defaultParams } from '@/catalog/nodes'
import { downloadPipeline } from '@/lib/download'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import { NodePalette } from './NodePalette'
import { CanvasFlow, type Selection } from './CanvasFlow'
import { Inspector } from './Inspector'
import { newStepId, normalizeImportedPipeline, pipelineFromPreset } from './_helpers'

/**
 * Studio-style pipeline editor: a three-pane workspace — operator palette (left),
 * the drag-and-drop pipeline flow (center), and a context inspector (right) — over
 * the flat preprocessing→model→CV DSL. Mirrors the interaction model of
 * nirs4all-studio's pipeline editor, scoped to the exported nirs4all-methods nodes.
 */
export function PipelineBuilder({ pipeline, taskType, running, progress, onChange, onRun, onCancel }: PipelineBuilderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<Selection>({ kind: 'model' })

  const update = (patch: Partial<PipelineDSL>) => onChange({ ...pipeline, ...patch })
  const setSteps = (steps: PipelineStep[]) => update({ steps })

  const addStep = (type: string) => insertStep(type, pipeline.steps.length)

  const insertStep = (type: string, index: number) => {
    const step: PipelineStep = { id: newStepId(type), type, params: defaultParams(type) }
    const next = [...pipeline.steps]
    next.splice(Math.max(0, Math.min(index, next.length)), 0, step)
    setSteps(next)
    setSelected({ kind: 'step', id: step.id })
  }

  const moveStep = (from: number, to: number) => {
    if (from === to || from < 0 || from >= pipeline.steps.length) return
    const next = [...pipeline.steps]
    const [moved] = next.splice(from, 1)
    // `to` is a drop-zone index counted in the original layout
    next.splice(from < to ? to - 1 : to, 0, moved)
    setSteps(next)
  }

  const removeStep = (id: string) => {
    setSteps(pipeline.steps.filter((s) => s.id !== id))
    if (selected.kind === 'step' && selected.id === id) setSelected({ kind: 'model' })
  }

  const setStepParam = (id: string, name: string, value: number | boolean | string) =>
    setSteps(pipeline.steps.map((s) => (s.id === id ? { ...s, params: { ...s.params, [name]: value } } : s)))

  // generators / finetune mutators (write the optional DSL fields dag-ml expands)
  const setStepSweep = (id: string, param: string, sweep: ParamSweep | undefined) =>
    setSteps(
      pipeline.steps.map((s) => {
        if (s.id !== id) return s
        const sweeps = { ...(s.sweeps ?? {}) }
        if (sweep) sweeps[param] = sweep
        else delete sweeps[param]
        return { ...s, sweeps: Object.keys(sweeps).length ? sweeps : undefined }
      }),
    )
  const setStepVariants = (id: string, variants: StepVariant[] | undefined) =>
    setSteps(pipeline.steps.map((s) => (s.id === id ? { ...s, variants } : s)))

  const setModelType = (type: string, params: Record<string, unknown>) => update({ model: { id: newStepId(type), type, params } })
  const setModelParam = (name: string, value: number | boolean | string) =>
    update({ model: { ...pipeline.model, params: { ...pipeline.model.params, [name]: value } } })
  const setModelSweep = (param: string, sweep: ParamSweep | undefined) => {
    const sweeps = { ...(pipeline.model.sweeps ?? {}) }
    if (sweep) sweeps[param] = sweep
    else delete sweeps[param]
    update({ model: { ...pipeline.model, sweeps: Object.keys(sweeps).length ? sweeps : undefined } })
  }
  const setModelFinetune = (finetune: FinetuneSpec | undefined) => update({ finetune })
  const setCv = (patch: Partial<PipelineDSL['cv']>) => update({ cv: { ...pipeline.cv, ...patch } })

  const totalVariants = countVariants(pipeline)

  const applyPreset = (preset: Preset) => {
    onChange(pipelineFromPreset(preset))
    setSelected({ kind: 'model' })
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const normalized = normalizeImportedPipeline(parsed)
        if (normalized) {
          onChange(normalized)
          setSelected({ kind: 'model' })
        } else window.alert('Invalid pipeline file: needs a `steps` array and a `model`, all with catalog node types.')
      } catch {
        window.alert('Could not parse the file as JSON.')
      }
    }
    reader.readAsText(file)
  }

  const presets = PRESETS.filter((p) => p.task === 'any' || p.task === taskType)

  return (
    <div className="flex h-full flex-col gap-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input
            value={pipeline.name}
            onChange={(e) => update({ name: e.target.value })}
            className="h-9 w-52 font-display text-sm font-semibold"
            aria-label="Pipeline name"
          />
          <span className="hidden rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:inline">
            {pipeline.steps.length} step{pipeline.steps.length === 1 ? '' : 's'} · {pipeline.cv.folds}-fold
          </span>
          {totalVariants > 1 ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-orange-600"
              data-variant-chip
              title="Variants dag-ml will expand and select among"
            >
              ×{totalVariants} variants
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Sparkles className="size-4 text-brand-teal" /> Presets
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Start from a preset</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {presets.map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => applyPreset(p)} className="flex-col items-start gap-0.5 py-2">
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{p.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} title="Import pipeline (.json)">
            <Upload className="size-4" /> <span className="hidden sm:inline">Import</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadPipeline(pipeline)} title="Export pipeline (.json)">
            <Download className="size-4" /> <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* three-pane editor */}
      <div className="grid min-h-[30rem] flex-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <aside className="hidden rounded-2xl border border-border bg-card/70 p-3 lg:block">
          <NodePalette onAdd={addStep} />
        </aside>
        <section className="rounded-2xl border border-border bg-card/70 p-4">
          <CanvasFlow
            pipeline={pipeline}
            taskType={taskType}
            selected={selected}
            running={running}
            progress={progress}
            onSelect={setSelected}
            onInsert={insertStep}
            onMove={moveStep}
            onRemove={removeStep}
            onRun={onRun}
            onCancel={onCancel}
          />
        </section>
        <aside className="rounded-2xl border border-border bg-card/70 p-4">
          <Inspector
            pipeline={pipeline}
            taskType={taskType}
            selected={selected}
            onStepParam={setStepParam}
            onStepSweep={setStepSweep}
            onStepVariants={setStepVariants}
            onModelType={setModelType}
            onModelParam={setModelParam}
            onModelSweep={setModelSweep}
            onModelFinetune={setModelFinetune}
            onCv={setCv}
          />
        </aside>
      </div>

      {/* mobile palette fallback (left palette is hidden on small screens) */}
      <div className="lg:hidden">
        <div className="rounded-2xl border border-border bg-card/70 p-3">
          <NodePalette onAdd={addStep} />
        </div>
      </div>
    </div>
  )
}
