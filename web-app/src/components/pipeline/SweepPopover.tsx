import { useCallback, useMemo, useState } from 'react'
import { ArrowRight, Check, List, Repeat, Sparkles, TrendingUp, X } from 'lucide-react'
import type { ParamSweep, SweepType } from '@/engine/types'
import { sweepVariantCount } from '@/engine/dagml'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Separator } from '@/app/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover'
import { cn } from '@/app/components/ui/utils'

// Trimmed from nirs4all-studio's SweepConfigPopover: only the three sweep kinds
// dag-ml's per-step param_generators support here (range / log_range / or — grid
// dropped). The popover writes a ParamSweep onto step.sweeps[param]; dag-ml does
// the actual variant expansion + cap. The badge shows the live variant count.

const TYPE_CONFIG: Record<SweepType, { label: string; icon: typeof Repeat }> = {
  range: { label: 'Range', icon: TrendingUp },
  log_range: { label: 'Log range', icon: Sparkles },
  or: { label: 'Discrete', icon: List },
}

const PRESETS: { label: string; sweep: ParamSweep; forParams?: string[] }[] = [
  { label: '1→10', sweep: { type: 'range', from: 1, to: 10, step: 1 }, forParams: ['n_components'] },
  { label: '1→20', sweep: { type: 'range', from: 1, to: 20, step: 1 }, forParams: ['n_components'] },
  { label: '5,10,20', sweep: { type: 'or', choices: [5, 10, 20] }, forParams: ['n_components'] },
  { label: '1e-3→100 log', sweep: { type: 'log_range', from: 0.001, to: 100, count: 6 }, forParams: ['alpha', 'C', 'gamma'] },
  { label: '0,1,2', sweep: { type: 'or', choices: [0, 1, 2] }, forParams: ['deriv', 'polyorder', 'order'] },
]

function fmt(v: unknown): string {
  if (typeof v === 'number') {
    if (v !== 0 && (Math.abs(v) < 0.001 || Math.abs(v) >= 10000)) return v.toExponential(1)
    if (v % 1 !== 0) return v.toPrecision(3)
    return String(v)
  }
  return String(v)
}

export interface SweepPopoverProps {
  paramKey: string
  currentValue: unknown
  sweep: ParamSweep | undefined
  onSweepChange: (sweep: ParamSweep | undefined) => void
}

/** Sweep activator + editor rendered next to a numeric ParamField in the Inspector. */
export function SweepPopover({ paramKey, currentValue, sweep, onSweepChange }: SweepPopoverProps) {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<ParamSweep | undefined>(sweep)
  const isNumeric = typeof currentValue === 'number'
  const hasSweep = !!sweep
  const count = useMemo(() => (local ? sweepVariantCount(local) : 0), [local])

  const enable = useCallback((): ParamSweep => {
    if (isNumeric) {
      const v = currentValue as number
      return { type: 'range', from: Math.max(0, Math.floor(v * 0.5)) || 1, to: Math.ceil(v * 1.5) || v + 10, step: v >= 10 ? Math.ceil(v * 0.1) : 1 }
    }
    return { type: 'or', choices: [currentValue as string | number | boolean] }
  }, [currentValue, isNumeric])

  const changeType = useCallback(
    (type: SweepType) => {
      if (type === 'range') {
        const v = isNumeric ? (currentValue as number) : 10
        setLocal({ type: 'range', from: Math.max(0, Math.floor(v * 0.5)) || 1, to: Math.ceil(v * 1.5) || v + 10, step: 1 })
      } else if (type === 'log_range') {
        const v = isNumeric ? Math.max(0.001, currentValue as number) : 1
        setLocal({ type: 'log_range', from: Math.max(0.0001, v * 0.1), to: v * 10, count: 5 })
      } else {
        setLocal({ type: 'or', choices: isNumeric ? [currentValue as number] : [currentValue as string | number | boolean] })
      }
    },
    [currentValue, isNumeric],
  )

  const preview = useMemo(() => {
    if (!local) return [] as (string | number | boolean)[]
    if (local.type === 'or') return (local.choices ?? []).slice(0, 8)
    if (local.type === 'range') {
      const out: number[] = []
      const step = local.step ?? 1
      if (step <= 0) return out
      for (let v = local.from ?? 0; v <= (local.to ?? 0) && out.length < 8; v += step) out.push(v)
      return out
    }
    const from = local.from ?? 0.001
    const to = local.to ?? 100
    const n = Math.max(2, local.count ?? 5)
    const lf = Math.log10(from)
    const ls = (Math.log10(to) - lf) / (n - 1)
    return Array.from({ length: Math.min(8, n) }, (_, i) => Math.pow(10, lf + i * ls))
  }, [local])

  const presets = PRESETS.filter((p) => !p.forParams || p.forParams.some((fp) => paramKey.toLowerCase().includes(fp.toLowerCase())))

  const handleOpen = useCallback(
    (next: boolean) => {
      if (next) setLocal(sweep ?? enable())
      setOpen(next)
    },
    [sweep, enable],
  )

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={hasSweep ? 'default' : 'ghost'}
          size="sm"
          data-sweep-trigger={paramKey}
          className={cn(
            'h-7 shrink-0 gap-1 px-2 text-xs',
            hasSweep ? 'bg-orange-500 text-white hover:bg-orange-600' : 'text-muted-foreground hover:bg-orange-500/10 hover:text-orange-600',
          )}
          title="Sweep this parameter"
        >
          <Repeat className="size-3.5" />
          {hasSweep ? `${sweepVariantCount(sweep)}×` : 'Sweep'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" sideOffset={4} className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-orange-500/10 text-orange-500">
              <Repeat className="size-3.5" />
            </span>
            <div>
              <div className="text-sm font-medium text-foreground">Parameter sweep</div>
              <div className="font-mono text-[11px] text-muted-foreground">{paramKey}</div>
            </div>
          </div>
          <Badge variant="secondary" className="bg-orange-500/10 text-orange-600" data-sweep-count>
            {count}×
          </Badge>
        </div>

        <div className="space-y-3 p-3">
          <div className="flex gap-1.5">
            {(['range', 'log_range', 'or'] as SweepType[])
              .filter((t) => t === 'or' || isNumeric)
              .map((t) => {
                const cfg = TYPE_CONFIG[t]
                const Icon = cfg.icon
                const active = local?.type === t
                return (
                  <Button
                    key={t}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => changeType(t)}
                    className={cn('h-8 flex-1 gap-1', active && 'bg-orange-500 text-white hover:bg-orange-600')}
                  >
                    <Icon className="size-3.5" />
                    <span className="text-xs">{cfg.label}</span>
                  </Button>
                )
              })}
          </div>

          <Separator />

          {local?.type === 'range' && (
            <div className="grid grid-cols-3 gap-2">
              {(['from', 'to', 'step'] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-[11px] capitalize text-muted-foreground">{k === 'from' ? 'Start' : k === 'to' ? 'End' : 'Step'}</Label>
                  <Input
                    type="number"
                    className="h-8 font-mono"
                    value={local[k] ?? (k === 'step' ? 1 : 0)}
                    onChange={(e) => setLocal({ ...local, [k]: k === 'step' ? Math.max(0.0001, Number(e.target.value) || 1) : Number(e.target.value) || 0 })}
                  />
                </div>
              ))}
            </div>
          )}

          {local?.type === 'log_range' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Min</Label>
                <Input type="number" className="h-8 font-mono" value={local.from ?? 0.001} step={0.001} onChange={(e) => setLocal({ ...local, from: Math.max(1e-7, Number(e.target.value) || 0.001) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Max</Label>
                <Input type="number" className="h-8 font-mono" value={local.to ?? 100} step={0.001} onChange={(e) => setLocal({ ...local, to: Number(e.target.value) || 100 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Count</Label>
                <Input type="number" className="h-8 font-mono" min={2} max={50} value={local.count ?? 5} onChange={(e) => setLocal({ ...local, count: Math.max(2, Math.min(50, Math.round(Number(e.target.value)) || 5)) })} />
              </div>
            </div>
          )}

          {local?.type === 'or' && (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Values (comma-separated)</Label>
              <Input
                className="h-8 font-mono"
                placeholder="5, 10, 20"
                value={(local.choices ?? []).join(', ')}
                onChange={(e) => {
                  const choices = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s !== '')
                    .map((s) => {
                      const num = Number(s)
                      if (!Number.isNaN(num) && isNumeric) return num
                      if (s === 'true') return true
                      if (s === 'false') return false
                      return s as string | number | boolean
                    })
                  setLocal({ ...local, choices })
                }}
              />
            </div>
          )}

          {preview.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/40 p-2">
              {preview.map((v, i) => (
                <span key={i} className="flex items-center">
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {fmt(v)}
                  </Badge>
                  {i < preview.length - 1 && i < 6 ? <ArrowRight className="mx-0.5 size-3 text-muted-foreground/40" /> : null}
                </span>
              ))}
              {count > 8 ? <Badge variant="secondary" className="text-[11px]">+{count - 8}</Badge> : null}
            </div>
          )}

          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.slice(0, 5).map((p, i) => (
                <Button key={i} variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setLocal(p.sweep)}>
                  {p.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => {
              setLocal(undefined)
              onSweepChange(undefined)
              setOpen(false)
            }}
          >
            <X className="size-3.5" /> Clear
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-orange-500 px-3 text-xs hover:bg-orange-600"
            disabled={!local || count < 1}
            onClick={() => {
              onSweepChange(local)
              setOpen(false)
            }}
          >
            <Check className="size-3.5" /> Apply ({count})
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
