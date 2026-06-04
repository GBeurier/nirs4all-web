import { useRef } from 'react'
import {
  Download,
  Layers3,
  ListChecks,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Square,
  Upload,
  Workflow,
} from 'lucide-react'
import type { PipelineBuilderProps } from '@/components/contracts'
import type { Preset } from '@/catalog/types'
import type { PipelineDSL, PipelineStep } from '@/engine/types'
import { PREPROCESSING_NODES, defaultParams } from '@/catalog/nodes'
import { downloadPipeline } from '@/lib/download'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Progress } from '@/app/components/ui/progress'
import { Separator } from '@/app/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import { StepCard } from './StepCard'
import { ModelPicker } from './ModelPicker'
import { PresetGallery } from './PresetGallery'
import { iconByName, isPipelineDSL, newStepId, phaseLabel, pipelineFromPreset } from './_helpers'

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  tint = 'teal',
  action,
}: {
  icon: typeof Workflow
  title: string
  subtitle?: string
  tint?: 'teal' | 'cyan' | 'indigo'
  action?: React.ReactNode
}) {
  const tintClass =
    tint === 'cyan'
      ? 'bg-brand-cyan/10 text-brand-cyan'
      : tint === 'indigo'
        ? 'bg-brand-indigo/10 text-brand-indigo'
        : 'bg-brand-teal/10 text-brand-teal'
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={`flex size-9 items-center justify-center rounded-full ${tintClass}`}>
          <Icon className="size-4" />
        </span>
        <div>
          <h3 className="font-semibold leading-tight text-foreground">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  )
}

export function PipelineBuilder({
  pipeline,
  taskType,
  running,
  progress,
  onChange,
  onRun,
  onCancel,
}: PipelineBuilderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- mutation helpers (all produce a fresh DSL and call onChange) ---
  const update = (patch: Partial<PipelineDSL>) => onChange({ ...pipeline, ...patch })

  const setSteps = (steps: PipelineStep[]) => update({ steps })

  const addStep = (type: string) => {
    const step: PipelineStep = { id: newStepId(type), type, params: defaultParams(type) }
    setSteps([...pipeline.steps, step])
  }

  const removeStep = (id: string) => setSteps(pipeline.steps.filter((s) => s.id !== id))

  const moveStep = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= pipeline.steps.length) return
    const next = [...pipeline.steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSteps(next)
  }

  const setStepParam = (id: string, name: string, value: number | boolean | string) => {
    setSteps(
      pipeline.steps.map((s) => (s.id === id ? { ...s, params: { ...s.params, [name]: value } } : s)),
    )
  }

  const setModelType = (type: string, params: Record<string, unknown>) => {
    update({ model: { id: newStepId(type), type, params } })
  }
  const setModelParam = (name: string, value: number | boolean | string) => {
    update({ model: { ...pipeline.model, params: { ...pipeline.model.params, [name]: value } } })
  }

  const setCv = (patch: Partial<PipelineDSL['cv']>) => update({ cv: { ...pipeline.cv, ...patch } })

  const applyPreset = (preset: Preset) => onChange(pipelineFromPreset(preset))

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (isPipelineDSL(parsed)) onChange(parsed)
        else window.alert('Invalid pipeline file: missing a valid `model` and `steps` array.')
      } catch {
        window.alert('Could not parse the file as JSON.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-6">
      <Tabs defaultValue="build" className="gap-6">
        <TabsList className="w-full">
          <TabsTrigger value="presets" className="gap-1.5">
            <Sparkles className="size-4" /> Presets
          </TabsTrigger>
          <TabsTrigger value="build" className="gap-1.5">
            <Workflow className="size-4" /> Build
          </TabsTrigger>
          <TabsTrigger value="io" className="gap-1.5">
            <Layers3 className="size-4" /> Import / Export
          </TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- Presets */}
        <TabsContent value="presets" className="space-y-4">
          <SectionHeader
            icon={Sparkles}
            title="Start from a preset"
            subtitle="Ready-to-run pipelines you can edit in the Build tab."
          />
          <PresetGallery taskType={taskType} onPick={applyPreset} />
        </TabsContent>

        {/* ------------------------------------------------------------------ Build */}
        <TabsContent value="build" className="space-y-6">
          <Card className="gap-5 p-6">
            <SectionHeader
              icon={Workflow}
              title="Preprocessing"
              subtitle="Ordered transforms applied to every spectrum before the model."
              action={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Plus className="size-4" /> Add step
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {PREPROCESSING_NODES.map((node) => {
                      const Icon = iconByName(node.icon)
                      return (
                        <DropdownMenuItem
                          key={node.type}
                          onSelect={() => addStep(node.type)}
                          className="gap-2"
                        >
                          <Icon className="size-4 text-brand-teal" />
                          <span className="flex-1">{node.name}</span>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
            {pipeline.steps.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No preprocessing steps — raw spectra feed the model directly.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pipeline.steps.map((step, index) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={index}
                    count={pipeline.steps.length}
                    onChangeParam={(name, value) => setStepParam(step.id, name, value)}
                    onMoveUp={() => moveStep(index, -1)}
                    onMoveDown={() => moveStep(index, 1)}
                    onRemove={() => removeStep(step.id)}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card className="gap-5 p-6">
            <SectionHeader
              icon={ListChecks}
              title="Model"
              subtitle="The terminal estimator scored by cross-validation."
              tint="indigo"
            />
            <ModelPicker
              model={pipeline.model}
              taskType={taskType}
              onChangeType={setModelType}
              onChangeParam={setModelParam}
            />
          </Card>

          <Card className="gap-5 p-6">
            <SectionHeader
              icon={Settings2}
              title="Cross-validation"
              subtitle="K-fold validation drives model selection and reported scores."
              tint="cyan"
            />
            <div className="grid grid-cols-2 gap-4 sm:max-w-md">
              <div className="space-y-1.5">
                <Label htmlFor="cv-folds" className="text-xs text-muted-foreground">
                  Folds
                </Label>
                <Input
                  id="cv-folds"
                  type="number"
                  className="font-mono"
                  min={2}
                  max={10}
                  value={pipeline.cv.folds}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value))
                    if (Number.isFinite(v)) setCv({ folds: Math.min(10, Math.max(2, v)) })
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cv-seed" className="text-xs text-muted-foreground">
                  Random seed
                </Label>
                <Input
                  id="cv-seed"
                  type="number"
                  className="font-mono"
                  value={pipeline.cv.seed}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value))
                    if (Number.isFinite(v)) setCv({ seed: v })
                  }}
                />
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------ Import / Export */}
        <TabsContent value="io" className="space-y-6">
          <Card className="gap-5 p-6">
            <SectionHeader
              icon={Layers3}
              title="Import / Export"
              subtitle="Move pipelines in and out as portable JSON."
            />
            <div className="flex flex-wrap gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImport}
              />
              <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4" /> Import pipeline (.json)
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => downloadPipeline(pipeline)}>
                <Download className="size-4" /> Export pipeline
              </Button>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Live DSL</Label>
              <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed text-foreground">
                {JSON.stringify(pipeline, null, 2)}
              </pre>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* -------------------------------------------------------------- Sticky run bar */}
      <div className="sticky bottom-0 z-10 -mx-1 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
        {running && progress ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{phaseLabel(progress.phase)}</span>
                {progress.message ? (
                  <span className="text-muted-foreground">— {progress.message}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  {Math.round(progress.pct)}%
                </span>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={onCancel}>
                  <Square className="size-3.5" /> Cancel
                </Button>
              </div>
            </div>
            <Progress value={progress.pct} />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <PipelineSummary pipeline={pipeline} />
            <Button size="lg" className="gap-2" disabled={running} onClick={onRun}>
              <Play className="size-5" /> Run pipeline
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function PipelineSummary({ pipeline }: { pipeline: PipelineDSL }) {
  return (
    <div className="min-w-0 flex-1 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{pipeline.name}</span>
      <span className="ml-2 font-mono text-xs">
        {pipeline.steps.length} step{pipeline.steps.length === 1 ? '' : 's'} ·{' '}
        {pipeline.model.type} · {pipeline.cv.folds}-fold
      </span>
    </div>
  )
}
