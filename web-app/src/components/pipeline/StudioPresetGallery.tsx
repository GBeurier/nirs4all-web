import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { webPresetsFor } from '@/catalog/webPresets'
import type { PipelineDSL, TaskType } from '@/engine/types'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog'

export function StudioPresetGallery({ taskType, onSelect }: { taskType: TaskType; onSelect: (pipeline: PipelineDSL) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const presets = webPresetsFor(taskType).filter((preset) => `${preset.name} ${preset.description}`.toLowerCase().includes(search.toLowerCase()))
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" className="gap-1.5"><Sparkles className="size-4 text-brand-teal" /> Presets</Button>
    </DialogTrigger>
    <DialogContent className="flex transition-none max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[1400px]">
      <DialogHeader className="shrink-0">
        <DialogTitle>Presets</DialogTitle>
        <DialogDescription>The Studio presets, ready to run in the browser.</DialogDescription>
      </DialogHeader>
      <Input aria-label="Search presets" placeholder="Search presets…" value={search} onChange={(event) => setSearch(event.target.value)} className="shrink-0" />
      <div className="min-h-0 overflow-auto p-1" data-web-preset-gallery>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {presets.map((preset) =>
            <button key={preset.id} type="button" data-web-preset={preset.id}
              className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-brand-teal hover:bg-accent/40"
              onClick={() => { onSelect(structuredClone(preset.pipeline)); setOpen(false) }}>
              <span className="block font-medium">{preset.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{preset.description}</span>
            </button>)}
        </div>
        {presets.length === 0 && <p className="p-6 text-center text-muted-foreground">No presets match your search.</p>}
      </div>
    </DialogContent>
  </Dialog>
}
