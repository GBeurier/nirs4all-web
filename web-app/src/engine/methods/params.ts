import type { NodeDef, ParamDef } from '@/catalog/types'

/** Positional parameter vector for the legacy WASM dispatcher: the node's params
 *  in declaration order, minus `n_components` (passed separately). */
export function legacyParamVector(def: NodeDef | undefined, params: Record<string, unknown>): number[] {
  return (def?.params ?? [])
    .filter((p) => p.name !== 'n_components')
    .map((p) => legacyParamValue(p, params[p.name]))
}

/** A param as the dispatcher reads it: bools as 0/1, choices as their index. */
export function legacyParamValue(param: ParamDef, value: unknown): number {
  const v = value ?? param.default
  if (typeof v === 'boolean') return v ? 1 : 0
  if (param.options) return param.options.findIndex((o) => o.value === v)
  return Number(v)
}
