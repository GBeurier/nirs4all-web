import type { TaskType } from '@/engine/types'

export type NodeCategory = 'preprocessing' | 'model'
export type ParamType = 'int' | 'float' | 'bool' | 'select'

export interface ParamDef {
  name: string
  label?: string
  type: ParamType
  default: number | boolean | string
  min?: number
  max?: number
  step?: number
  options?: { value: string | number; label: string }[]
  help?: string
}

/**
 * One node = one exported nirs4all-methods operator. The `type` token is what the
 * pipeline DSL and the engine dispatch on; `n4m` carries the real libn4m ABI
 * symbols so a CI validator can check them against
 * nirs4all-methods/catalog/abi_method_map.yaml (and so the future dag-ml/libn4m
 * controller can translate type → symbol). Adding a method later = add one entry.
 */
export interface NodeDef {
  /** libn4m method id, e.g. 'preprocessing.scatter.snv' */
  id: string
  /** DSL token the engine dispatches on, e.g. 'StandardNormalVariate' */
  type: string
  name: string
  category: NodeCategory
  subcategory?: string
  description: string
  /** lucide-react icon name */
  icon?: string
  /** for models: which tasks they support */
  task?: TaskType | 'any'
  params: ParamDef[]
  /** exported libn4m ABI symbols (validated in CI; null fit = stateless) */
  n4m: { fit: string | null; transform?: string; predict?: string }
  /** stateful transforms must reuse fit-state on test/predict data */
  stateful?: boolean
  advanced?: boolean
}

export interface Preset {
  id: string
  name: string
  description: string
  task: TaskType | 'any'
  /** ordered preprocessing `type` tokens + the model token, with default params */
  steps: { type: string; params?: Record<string, unknown> }[]
  model: { type: string; params?: Record<string, unknown> }
}
