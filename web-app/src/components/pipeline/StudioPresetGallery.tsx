import { useState } from 'react'
import { Beaker, Boxes, Calculator, Cpu, Flame, FlaskConical, Gauge, GitBranch, Sparkles, Zap } from 'lucide-react'
import { PipelinePresetCard } from 'nirs4all-ui/components'
import { getPresetComplexityMeta, type PipelinePresetVariantId } from 'nirs4all-ui/pipelines'
import 'nirs4all-ui/assets/pipeline-presets.css'
import { PRESETS } from '@/catalog/presets'
import { browserPreset, webPresetsFor } from '@/catalog/webPresets'
import type { PipelineDSL, TaskType } from '@/engine/types'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog'

const icons = { simple_pls: Calculator, fast_result: Zap, simple_trees_boosting: Sparkles,
  complex_pls: FlaskConical, complex_trees: Beaker, nonlinear_exploration: GitBranch,
  ultra_pls: Boxes, ultra_trees: Cpu, deep_nonlinear_exploration: Cpu, ultra_slow: Flame }
const complexityIcons = { starter: Zap, quick: Sparkles, balanced: Gauge, heavy: Boxes, exhaustive: Flame }

export function StudioPresetGallery({ taskType, onSelect }: { taskType: TaskType; onSelect: (pipeline: PipelineDSL) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const task: PipelinePresetVariantId = taskType === 'regression' ? 'regression' : 'classification'
  const entries = webPresetsFor(taskType)
  const presets = PRESETS.filter((preset) => entries.some((entry) => entry.presetId === preset.id))
    .filter((preset) => `${preset.name} ${preset.description}`.toLowerCase().includes(search.toLowerCase()))
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" className="gap-1.5"><Sparkles className="size-4 text-brand-teal" /> Presets</Button>
    </DialogTrigger>
    <DialogContent className="flex transition-none max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[1400px]">
      <DialogHeader className="shrink-0">
        <DialogTitle>Presets</DialogTitle>
        <DialogDescription>The nirs4all Studio presets, ready to run in the browser. Pick a model to open the pipeline.</DialogDescription>
      </DialogHeader>
      <Input aria-label="Search presets" placeholder="Search presets…" value={search} onChange={(event) => setSearch(event.target.value)} className="shrink-0" />
      <div className="min-h-0 overflow-auto p-1" data-web-preset-gallery>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {presets.map((preset) => {
            const Icon = icons[preset.id as keyof typeof icons] ?? GitBranch
            const meta = getPresetComplexityMeta(preset.complexity)
            const ComplexityIcon = complexityIcons[meta.key]
            return <PipelinePresetCard key={preset.id} preset={browserPreset(preset, task)}
              templateIcon={<Icon />} complexityIcon={<ComplexityIcon />}
              complexityBadge={<span className={`n4-preset-complexity n4-preset-${meta.key}`}><ComplexityIcon />{preset.complexity}/10 <span>{meta.key}</span></span>}
              previewIcons={{ branch: <GitBranch />, model: <Cpu />, step: <Boxes />, generator: <Sparkles className="text-amber-500" /> }}
              renderVariant={() => <div className="flex flex-col gap-1">
                {entries.filter((entry) => entry.presetId === preset.id).map((entry) =>
                  <button key={entry.id} type="button" data-web-preset={entry.id} className={`n4-preset-action n4-preset-action-${task}`}
                    onClick={() => { onSelect(structuredClone(entry.pipeline)); setOpen(false) }}>
                    {entry.model}
                  </button>)}
              </div>}
            />
          })}
        </div>
        {presets.length === 0 && <p className="p-6 text-center text-muted-foreground">No presets match your search.</p>}
      </div>
    </DialogContent>
  </Dialog>
}
