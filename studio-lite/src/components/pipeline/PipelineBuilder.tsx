import { useRef, useState } from 'react'
import { Download, Sparkles, Upload } from 'lucide-react'
import type { PipelineBuilderProps } from '@/components/contracts'
import type { Preset, ParamValue } from '@/catalog/types'
import type { ContainerNode, FinetuneSpec, GeneratorMode, ParamSweep, PipelineDSL, PipelineStep, StepVariant } from '@/engine/types'
import { countVariants } from '@/engine/dagml'
import { PRESETS } from '@/catalog/presets'
import { dagNodeFor, defaultParams, modelsForTask, nodeByType } from '@/catalog/nodes'
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
import { isAutonomousPipeline, newBranchId, newContainer, newStepId, normalizeImportedPipeline, pipelineFromPreset, pipelineWarnings, sanitizeAutonomousPipeline } from './_helpers'
import { AlertTriangle } from 'lucide-react'

/**
 * Studio-style pipeline editor: a three-pane workspace — operator palette (left),
 * the drag-and-drop pipeline flow (center), and a context inspector (right) — over
 * the flat preprocessing→model→CV DSL. Mirrors the interaction model of
 * nirs4all-studio's pipeline editor, scoped to the exported nirs4all-methods nodes.
 */
export function PipelineBuilder({ pipeline, taskType, datasetLabel, running, progress, runLog, onChange, onRun, onCancel }: PipelineBuilderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<Selection>({ kind: 'model' })
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null)

  const update = (patch: Partial<PipelineDSL>) => onChange({ ...pipeline, ...patch })
  const setSteps = (steps: PipelineStep[]) => update({ steps })
  const autonomous = isAutonomousPipeline(pipeline)
  const autonomousName = pipeline.model ? (nodeByType(pipeline.model.type)?.name ?? pipeline.model.type) : 'This model'
  const blockAutonomousExternal = () => {
    setBlockedNotice(`${autonomousName} screens preprocessing internally; external preprocessing and DAG nodes were not added.`)
    setSelected({ kind: 'model' })
  }

  // The palette/canvas surface ALL operators; route each add by its catalog
  // category — preprocessing → chain step (or a focused container branch), split →
  // split node, model → model slot, dag → a structural container.
  const addOperator = (type: string, index?: number) => {
    const cat = nodeByType(type)?.category
    if (cat === 'model') {
      const next = { ...pipeline, model: { id: newStepId(type), type, params: defaultParams(type) } }
      onChange(sanitizeAutonomousPipeline(next))
      setBlockedNotice(null)
      setSelected({ kind: 'model' })
    } else if (autonomous && (cat === 'preprocessing' || cat === 'dag')) {
      blockAutonomousExternal()
    } else if (cat === 'split') {
      addSplit(type)
    } else if (cat === 'dag') {
      addContainer(type)
    } else if (cat === 'preprocessing' && (selected.kind === 'container' || selected.kind === 'containerStep')) {
      // a preprocessing add while a container branch is focused goes into the
      // focused branch (the branch of a selected step, the explicitly-focused
      // branch, else branch 0 of that container).
      const container = pipeline.containers?.find((c) => c.id === selected.containerId)
      const branchId = selected.branchId ?? container?.branches[0]?.id
      if (container && branchId) insertContainerStep(container.id, branchId, type)
      else insertStep(type, index ?? pipeline.steps.length)
    } else {
      insertStep(type, index ?? pipeline.steps.length)
    }
  }

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

  const setStepParam = (id: string, name: string, value: ParamValue) =>
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

  const setModelType = (type: string, params: Record<string, unknown>) => {
    const next = { ...pipeline, model: { id: newStepId(type), type, params } }
    onChange(sanitizeAutonomousPipeline(next))
    setBlockedNotice(null)
  }
  const setModelParam = (name: string, value: ParamValue) => {
    if (!pipeline.model) return
    update({ model: { ...pipeline.model, params: { ...pipeline.model.params, [name]: value } } })
  }
  const setModelSweep = (param: string, sweep: ParamSweep | undefined) => {
    if (!pipeline.model) return
    const sweeps = { ...(pipeline.model.sweeps ?? {}) }
    if (sweep) sweeps[param] = sweep
    else delete sweeps[param]
    update({ model: { ...pipeline.model, sweeps: Object.keys(sweeps).length ? sweeps : undefined } })
  }
  // model is OPTIONAL — removing it leaves a preprocessing-only pipeline; adding
  // one drops in the first model valid for the active task.
  const removeModel = () => {
    onChange({ ...pipeline, model: undefined, finetune: undefined })
    if (selected.kind === 'model') setSelected(pipeline.steps.length ? { kind: 'step', id: pipeline.steps[pipeline.steps.length - 1].id } : { kind: 'cv' })
  }
  const addModel = () => {
    const models = modelsForTask(taskType)
    const type = models[0]?.type
    if (!type) return
    update({ model: { id: newStepId(type), type, params: defaultParams(type) } })
    setSelected({ kind: 'model' })
  }
  const setModelFinetune = (finetune: FinetuneSpec | undefined) => update({ finetune })

  // cross-validation (the SECOND split) is OPTIONAL ---------------------------
  const DEFAULT_CV = { folds: 5, seed: 42 }
  const setCv = (patch: Partial<NonNullable<PipelineDSL['cv']>>) => update({ cv: { ...(pipeline.cv ?? DEFAULT_CV), ...patch } })
  const addCv = () => {
    update({ cv: pipeline.cv ?? DEFAULT_CV })
    setSelected({ kind: 'cv' })
  }
  const removeCv = () => {
    onChange({ ...pipeline, cv: undefined })
    if (selected.kind === 'cv') setSelected({ kind: 'model' })
  }

  // DAG containers (the recursive tree) — branch / concat / merge / generator ----
  const setContainers = (containers: ContainerNode[] | undefined) => onChange({ ...pipeline, containers: containers && containers.length ? containers : undefined })
  const patchContainer = (containerId: string, fn: (c: ContainerNode) => ContainerNode) =>
    setContainers((pipeline.containers ?? []).map((c) => (c.id === containerId ? fn(c) : c)))

  const addContainer = (dagType: string) => {
    if (autonomous) {
      blockAutonomousExternal()
      return
    }
    const def = dagNodeFor(dagType) ?? nodeByType(dagType)
    const meta = def?.dag
    if (!meta) return
    const c = newContainer(meta.container, meta.mode)
    setContainers([...(pipeline.containers ?? []), c])
    setSelected({ kind: 'container', containerId: c.id })
  }
  const removeContainer = (containerId: string) => {
    setContainers((pipeline.containers ?? []).filter((c) => c.id !== containerId))
    if ((selected.kind === 'container' || selected.kind === 'containerStep') && selected.containerId === containerId) setSelected({ kind: 'model' })
  }
  const addContainerBranch = (containerId: string) =>
    patchContainer(containerId, (c) => ({ ...c, branches: [...c.branches, { id: newBranchId(), steps: [] }] }))
  const removeContainerBranch = (containerId: string, branchId: string) => {
    const c = pipeline.containers?.find((x) => x.id === containerId)
    if (!c || c.branches.length <= 2) return
    patchContainer(containerId, (c) => ({ ...c, branches: c.branches.filter((b) => b.id !== branchId) }))
    if (selected.kind === 'containerStep' && selected.containerId === containerId && selected.branchId === branchId) setSelected({ kind: 'container', containerId })
  }
  const setContainerMode = (containerId: string, mode: GeneratorMode) => patchContainer(containerId, (c) => ({ ...c, mode }))
  const insertContainerStep = (containerId: string, branchId: string, type: string) => {
    if (autonomous) {
      blockAutonomousExternal()
      return
    }
    const step: PipelineStep = { id: newStepId(type), type, params: defaultParams(type) }
    patchContainer(containerId, (c) => ({ ...c, branches: c.branches.map((b) => (b.id === branchId ? { ...b, steps: [...b.steps, step] } : b)) }))
    setSelected({ kind: 'containerStep', containerId, branchId, stepId: step.id })
  }
  const removeContainerStep = (containerId: string, branchId: string, stepId: string) => {
    patchContainer(containerId, (c) => ({ ...c, branches: c.branches.map((b) => (b.id === branchId ? { ...b, steps: b.steps.filter((s) => s.id !== stepId) } : b)) }))
    if (selected.kind === 'containerStep' && selected.containerId === containerId && selected.branchId === branchId && selected.stepId === stepId) setSelected({ kind: 'container', containerId })
  }
  const setContainerStepParam = (containerId: string, branchId: string, stepId: string, name: string, value: ParamValue) =>
    patchContainer(containerId, (c) => ({
      ...c,
      branches: c.branches.map((b) => (b.id === branchId ? { ...b, steps: b.steps.map((s) => (s.id === stepId ? { ...s, params: { ...s.params, [name]: value } } : s)) } : b)),
    }))

  // split operator (optional, at most one, applied before CV) ---------------
  const addSplit = (type: string) => {
    update({ split: { id: newStepId(type), type, params: defaultParams(type) } })
    setSelected({ kind: 'split' })
  }
  const removeSplit = () => {
    onChange({ ...pipeline, split: undefined })
    if (selected.kind === 'split') setSelected({ kind: 'cv' })
  }
  const setSplitParam = (name: string, value: ParamValue) => {
    if (!pipeline.split) return
    update({ split: { ...pipeline.split, params: { ...pipeline.split.params, [name]: value } } })
  }

  const totalVariants = countVariants(pipeline)
  const warnings = pipelineWarnings(pipeline)
  const shownWarnings = blockedNotice ? [blockedNotice, ...warnings] : warnings

  const applyPreset = (preset: Preset) => {
    onChange(sanitizeAutonomousPipeline(pipelineFromPreset(preset)))
    setBlockedNotice(null)
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
          onChange(sanitizeAutonomousPipeline(normalized))
          setBlockedNotice(null)
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
            {pipeline.steps.length} step{pipeline.steps.length === 1 ? '' : 's'} · {pipeline.cv ? `${pipeline.cv.folds}-fold` : 'refit-only'}
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

      {/* light validation pass — soft, non-blocking editor guidance */}
      {shownWarnings.length > 0 && (
        <div data-pipeline-warnings className="flex flex-col gap-1 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2">
          {shownWarnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-warning">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}

      {/* three-pane editor */}
      <div className="grid min-h-[30rem] flex-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <aside className="hidden rounded-2xl border border-border bg-card/70 p-3 lg:block">
          <NodePalette onAdd={addOperator} taskType={taskType} />
        </aside>
        <section className="rounded-2xl border border-border bg-card/70 p-4">
          <CanvasFlow
            pipeline={pipeline}
            taskType={taskType}
            selected={selected}
            running={running}
            progress={progress}
            runLog={runLog}
            datasetLabel={datasetLabel}
            onSelect={setSelected}
            onInsert={addOperator}
            onMove={moveStep}
            onRemove={removeStep}
            onAddModel={addModel}
            onRemoveModel={removeModel}
            onAddSplit={addSplit}
            onRemoveSplit={removeSplit}
            onAddCv={addCv}
            onRemoveCv={removeCv}
            onAddContainer={addContainer}
            onRemoveContainer={removeContainer}
            onInsertContainerStep={insertContainerStep}
            onRemoveContainerStep={removeContainerStep}
            onAddContainerBranch={addContainerBranch}
            onRemoveContainerBranch={removeContainerBranch}
            onSetContainerMode={setContainerMode}
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
            onSplitParam={setSplitParam}
            onCv={setCv}
            onContainerStepParam={setContainerStepParam}
            onAddContainerBranch={addContainerBranch}
            onRemoveContainerBranch={removeContainerBranch}
            onSetContainerMode={setContainerMode}
          />
        </aside>
      </div>

      {/* mobile palette fallback (left palette is hidden on small screens) */}
      <div className="lg:hidden">
        <div className="rounded-2xl border border-border bg-card/70 p-3">
          <NodePalette onAdd={addOperator} taskType={taskType} />
        </div>
      </div>
    </div>
  )
}
