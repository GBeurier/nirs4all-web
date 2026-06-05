import { Plus, Sparkles, Trash2 } from 'lucide-react'
import type { FinetuneParam, FinetuneParamType, FinetuneSpec, PipelineStep } from '@/engine/types'
import { nodeByType } from '@/catalog/nodes'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Switch } from '@/app/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'

// Trimmed from nirs4all-studio's finetuning/{FinetuneSearchConfig,FinetuneParamEditor,
// FinetuneTab}: only the model hyperparameter search space (no timeout / sampler /
// NN train-params). Writes a FinetuneSpec → dag-ml model `tuning` (model_params).
// dag-ml builds the inner CV + trials and selects the best the same way as variants.

const PARAM_TYPES: { value: FinetuneParamType; label: string }[] = [
  { value: 'int', label: 'Integer' },
  { value: 'float', label: 'Float' },
  { value: 'log_float', label: 'Log float' },
  { value: 'categorical', label: 'Choices' },
]

export interface FinetunePanelProps {
  model: PipelineStep
  finetune: FinetuneSpec | undefined
  onChange: (finetune: FinetuneSpec | undefined) => void
}

const EMPTY: FinetuneSpec = { enabled: false, n_trials: 20, approach: 'grouped', eval_mode: 'best', params: [] }

/** "Tune" tab body for a model: enable the search + edit the hyperparameter space. */
export function FinetunePanel({ model, finetune, onChange }: FinetunePanelProps) {
  const ft = finetune ?? EMPTY
  const def = nodeByType(model.type)
  const numericParams = (def?.params ?? []).filter((p) => p.type === 'int' || p.type === 'float')

  const set = (patch: Partial<FinetuneSpec>) => onChange({ ...ft, ...patch })
  const setParam = (i: number, patch: Partial<FinetuneParam>) => set({ params: ft.params.map((p, k) => (k === i ? { ...p, ...patch } : p)) })
  const addParam = () => {
    const candidate = numericParams.find((p) => !ft.params.some((q) => q.name === p.name))
    const name = candidate?.name ?? def?.params[0]?.name ?? 'param'
    set({ params: [...ft.params, { name, type: 'int', low: Number(candidate?.min ?? 1), high: Number(candidate?.max ?? 30) }] })
  }
  const removeParam = (i: number) => set({ params: ft.params.filter((_, k) => k !== i) })

  return (
    <div className="space-y-4" data-finetune-panel>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
            <Sparkles className="size-4" />
          </span>
          <div>
            <div className="text-sm font-medium text-foreground">Hyperparameter search</div>
            <p className="text-[11px] text-muted-foreground">dag-ml runs trials over an inner CV + picks the best.</p>
          </div>
        </div>
        <Switch checked={ft.enabled} onCheckedChange={(c) => set({ enabled: c })} data-finetune-toggle aria-label="Enable finetuning" />
      </div>

      {ft.enabled ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Trials</Label>
              <Input
                type="number"
                className="h-9 font-mono"
                min={1}
                max={200}
                value={ft.n_trials}
                onChange={(e) => set({ n_trials: Math.max(1, Math.min(200, Math.round(Number(e.target.value)) || 20)) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Eval</Label>
              <Select value={ft.eval_mode ?? 'best'} onValueChange={(v) => set({ eval_mode: v as FinetuneSpec['eval_mode'] })}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">Best fold</SelectItem>
                  <SelectItem value="mean">Mean of folds</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Search space {ft.params.length > 0 ? `(${ft.params.length})` : ''}</span>
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={addParam} data-add-finetune-param>
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
            {ft.params.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground">
                Add a parameter to tune (e.g. n_components).
              </p>
            ) : (
              <div className="space-y-2">
                {ft.params.map((p, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-2.5" data-finetune-param>
                    <div className="flex items-center gap-2">
                      <Select value={p.name} onValueChange={(name) => setParam(i, { name })}>
                        <SelectTrigger size="sm" className="flex-1 font-mono text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(def?.params ?? []).map((dp) => (
                            <SelectItem key={dp.name} value={dp.name}>
                              {dp.label ?? dp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={p.type} onValueChange={(t) => setParam(i, { type: t as FinetuneParamType })}>
                        <SelectTrigger size="sm" className="w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PARAM_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeParam(i)} aria-label="Remove parameter">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    {p.type === 'categorical' ? (
                      <Input
                        className="h-8 font-mono text-xs"
                        placeholder="value1, value2"
                        value={(p.choices ?? []).join(', ')}
                        onChange={(e) =>
                          setParam(i, {
                            choices: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter((s) => s !== '')
                              .map((s) => (Number.isNaN(Number(s)) ? s : Number(s))),
                          })
                        }
                      />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Low</Label>
                          <Input type="number" className="h-8 font-mono" value={p.low ?? 0} onChange={(e) => setParam(i, { low: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">High</Label>
                          <Input type="number" className="h-8 font-mono" value={p.high ?? 0} onChange={(e) => setParam(i, { high: Number(e.target.value) })} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Enable to search the model's hyperparameters. The best trial is selected by dag-ml over a leakage-safe inner CV.
        </p>
      )}
    </div>
  )
}
