import { Plus, Trash2, Workflow } from 'lucide-react'
import type { PipelineStep, StepVariant } from '@/engine/types'
import type { ParamValue } from '@/catalog/types'
import { defaultParams, nodeByType } from '@/catalog/nodes'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { ParamField } from './ParamField'

// Trimmed from nirs4all-studio's OrGenerator: only the "try each" case (the pick/
// arrange combinatorics are dropped). Each alternative is a labelled set of PARAM
// OVERRIDES for THIS SAME node — dag-ml compact variants are param overrides on one
// node, not operator swaps (PipelineDslVariantChoice { label, params }, dsl.rs:185;
// the override targets the node's own id, dsl.rs:4794). The compiler lowers these to
// a step `variants[]` dimension and runs FIT_CV over each, selecting the winner.
// (Trying a DIFFERENT operator would need a generator/branch sequence dag-ml's
// compact-variant path does not express, so we expose param-only alternatives.)

export interface StepVariantsEditorProps {
  step: PipelineStep
  onChange: (variants: StepVariant[] | undefined) => void
}

/** Editor for a node's labelled param-override alternatives (dag-ml `variants`). */
export function StepVariantsEditor({ step, onChange }: StepVariantsEditorProps) {
  const variants = step.variants ?? []
  const def = nodeByType(step.type)

  const setVariants = (next: StepVariant[]) => onChange(next.length ? next : undefined)

  const addVariant = () => {
    const idx = variants.length + 1
    setVariants([...variants, { label: `Alt ${idx}`, type: step.type, params: { ...defaultParams(step.type) } }])
  }
  const patch = (i: number, change: Partial<StepVariant>) => setVariants(variants.map((v, k) => (k === i ? { ...v, ...change } : v)))
  const setVariantParam = (i: number, name: string, value: ParamValue) =>
    patch(i, { params: { ...variants[i].params, [name]: value } })
  const removeVariant = (i: number) => setVariants(variants.filter((_, k) => k !== i))

  return (
    <div className="space-y-3" data-step-variants>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Workflow className="size-3.5 text-orange-500" />
          Alternatives {variants.length > 0 ? `(${variants.length})` : ''}
        </span>
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={addVariant} data-add-variant>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      {variants.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground">
          Add labelled alternatives — each tries different params for this node, and dag-ml picks the best.
        </p>
      ) : (
        <div className="space-y-3">
          {variants.map((v, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3" data-variant-item>
              <div className="flex items-center gap-2">
                <Input
                  value={v.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  className="h-8 flex-1 text-xs"
                  aria-label="Variant label"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeVariant(i)}
                  aria-label="Remove alternative"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              {def && def.params.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {def.params.map((p) => (
                    <ParamField key={p.name} def={p} value={v.params[p.name] ?? p.default} onChange={(val) => setVariantParam(i, p.name, val)} />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">This node has no parameters to vary.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
