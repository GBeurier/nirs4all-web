import type { ParamDef } from '@/catalog/types'
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
  onChange: (value: number | boolean | string) => void
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
      {def.type === 'bool' ? (
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
