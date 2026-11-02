import { useRef, useState } from 'react'
import { Beaker, Boxes, Calculator, Cpu, Flame, FlaskConical, Gauge, GitBranch, Sparkles, Zap } from 'lucide-react'
import { PipelinePresetCard } from 'nirs4all-ui/components'
import { getPresetComplexityMeta, type PipelinePreset, type PipelinePresetVariantId } from 'nirs4all-ui/pipelines'
import 'nirs4all-ui/assets/pipeline-presets.css'
import { PRESETS } from '@/catalog/presets'
import { importStudioPreset, repositoryPresetUrl } from '@/catalog/studioPresets'
import { webPresetsFor } from '@/catalog/webPresets'
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
  const [notice, setNotice] = useState<{ preset: PipelinePreset; variant: PipelinePresetVariantId; reason: string } | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const choose = (preset: PipelinePreset, variant: PipelinePresetVariantId) => {
    const imported = importStudioPreset(preset, variant)
    const matchingTask = (taskType === 'regression') === (variant === 'regression')
    if (imported.kind === 'ready' && matchingTask) {
      onSelect(imported.pipeline)
      setNotice(null)
      setOpen(false)
    } else {
      setNotice({ preset, variant, reason: imported.kind === 'unavailable'
        ? imported.reason
        : `Load a ${variant} dataset to use this variant.` })
      scroll.current?.scrollTo({ top: 0, behavior: 'instant' })
    }
  }
  const download = () => {
    if (!notice) return
    const recipe = { pipeline: notice.preset.variants?.[notice.variant]?.pipeline }
    const url = URL.createObjectURL(new Blob([JSON.stringify(recipe, null, 2) + '\n'], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${notice.preset.id}-${notice.variant}.pipeline.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const presets = PRESETS.filter((preset) => `${preset.name} ${preset.description}`.toLowerCase().includes(search.toLowerCase()))
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" className="gap-1.5"><Sparkles className="size-4 text-brand-teal" /> Presets</Button>
    </DialogTrigger>
    <DialogContent className="flex transition-none max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[1400px]">
      <DialogHeader className="shrink-0">
        <DialogTitle>Studio presets</DialogTitle>
        <DialogDescription>The same default pipelines as Studio and Repository, with regression and classification variants.</DialogDescription>
      </DialogHeader>
      <Input aria-label="Search presets" placeholder="Search presets…" value={search} onChange={(event) => setSearch(event.target.value)} className="shrink-0" />
      <div ref={scroll} className="min-h-0 overflow-auto p-1" data-studio-preset-scroll>
        {notice && <section role="status" className="mb-4 min-w-0 rounded-lg border border-border bg-muted/30 p-4">
          <h3 className="font-semibold">{notice.preset.name} — {notice.variant}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{notice.reason}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={download}>Download original recipe</Button>
          <details className="mt-3 text-sm"><summary className="cursor-pointer">View original recipe</summary>
            <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify({ pipeline: notice.preset.variants?.[notice.variant]?.pipeline }, null, 2)}</pre>
          </details>
        </section>}
        <section className="mb-6" data-web-preset-gallery>
          <h3 className="mb-2 font-semibold">Ready to run in the browser</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {webPresetsFor(taskType).filter((preset) => `${preset.name} ${preset.description}`.toLowerCase().includes(search.toLowerCase())).map((preset) =>
              <button key={preset.id} type="button" data-web-preset={preset.id}
                className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-brand-teal hover:bg-accent/40"
                onClick={() => { onSelect(structuredClone(preset.pipeline)); setNotice(null); setOpen(false) }}>
                <span className="block font-medium">{preset.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{preset.description}</span>
              </button>)}
          </div>
          <h3 className="mb-2 mt-6 font-semibold">Studio presets</h3>
        </section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-studio-preset-gallery>
          {presets.map((preset) => {
            const Icon = icons[preset.id as keyof typeof icons] ?? GitBranch
            const meta = getPresetComplexityMeta(preset.complexity)
            const ComplexityIcon = complexityIcons[meta.key]
            return <PipelinePresetCard key={preset.id} preset={preset}
              templateIcon={<Icon />} complexityIcon={<ComplexityIcon />}
              complexityBadge={<span className={`n4-preset-complexity n4-preset-${meta.key}`}><ComplexityIcon />{preset.complexity}/10 <span>{meta.key}</span></span>}
              previewIcons={{ branch: <GitBranch />, model: <Cpu />, step: <Boxes />, generator: <Sparkles className="text-amber-500" /> }}
              renderVariant={(variant) => <><button type="button" className={`n4-preset-action n4-preset-action-${variant}`}
                aria-label={`${preset.name} — ${variant}`} onClick={() => choose(preset, variant)}>
                {variant === 'regression' ? 'Regression' : 'Classification'}
              </button><a href={repositoryPresetUrl(preset, variant)} target="_blank" rel="noreferrer"
                aria-label={`${preset.name} — ${variant} in Repository`}
                className="mt-1 block text-center text-xs text-muted-foreground underline">Repository ↗</a></>}
            />
          })}
        </div>
        {presets.length === 0 && <p className="p-6 text-center text-muted-foreground">No presets match your search.</p>}
      </div>
    </DialogContent>
  </Dialog>
}
