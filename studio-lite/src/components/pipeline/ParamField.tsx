import type { ParamDef, ParamValue } from '@/catalog/types'
import { AOM_OPERATOR_KINDS } from '@/catalog/types'
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

export interface ParamFieldProps {
  def: ParamDef
  value: unknown
  onChange: (value: ParamValue) => void
}

/** Compact checkbox list for an `operators` param (an n4m_operator_kind_t
 *  int[] AOM/POP bank). Selecting/deselecting toggles a kind in the bank. */
function OperatorBankField({ id, value, onChange }: { id: string; value: unknown; onChange: (value: number[]) => void }) {
  const selected = new Set(Array.isArray(value) ? value.map((v) => Number(v)) : [])
  const toggle = (kind: number) => {
    const next = new Set(selected)
    if (next.has(kind)) next.delete(kind)
    else next.add(kind)
    // keep bank in the catalog's display order for stable lineage
    onChange(AOM_OPERATOR_KINDS.filter((o) => next.has(o.value)).map((o) => o.value))
  }
  return (
    <div id={id} data-operator-bank className="grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-muted/30 p-2">
      {AOM_OPERATOR_KINDS.map((op) => {
        const on = selected.has(op.value)
        return (
          <label
            key={op.value}
            className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] hover:bg-muted"
          >
            <input
              type="checkbox"
              className="size-3.5 accent-brand-indigo"
              checked={on}
              data-op-kind={op.value}
              onChange={() => toggle(op.value)}
            />
            <span className={on ? 'text-foreground' : 'text-muted-foreground'}>{op.label}</span>
          </label>
        )
      })}
    </div>
  )
}

/** Renders a single pipeline-step parameter control driven by its ParamDef. */
export function ParamField({ def, value, onChange }: ParamFieldProps) {
  const id = `param-${def.name}`
  const label = def.label ?? def.name

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {def.type === 'operators' ? (
        <OperatorBankField id={id} value={value} onChange={onChange} />
      ) : def.type === 'bool' ? (
        <div className="flex h-9 items-center">
          <Switch
            id={id}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      ) : def.type === 'select' ? (
        <Select
          value={String(value)}
          onValueChange={(raw) => {
            const opt = def.options?.find((o) => String(o.value) === raw)
            onChange(opt ? opt.value : raw)
          }}
        >
          <SelectTrigger id={id} size="sm" className="font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {def.options?.map((opt) => (
              <SelectItem key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type="number"
          className="h-8 font-mono"
          value={value === undefined || value === null ? '' : Number(value)}
          min={def.min}
          max={def.max}
          step={def.step ?? (def.type === 'int' ? 1 : 'any')}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return
            const num = def.type === 'int' ? Math.round(Number(raw)) : Number(raw)
            if (Number.isFinite(num)) onChange(num)
          }}
        />
      )}
      {def.help ? <p className="text-[11px] leading-snug text-muted-foreground/80">{def.help}</p> : null}
    </div>
  )
}
