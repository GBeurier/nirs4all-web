import type { TaskType } from '@/engine/types'

export type NodeCategory = 'preprocessing' | 'model' | 'split' | 'filter' | 'augmentation' | 'dag'
export type ParamType = 'int' | 'float' | 'bool' | 'select' | 'array'

/** A single editable parameter value as carried by the pipeline DSL (`array`
 *  params carry a `number[]`). */
export type ParamValue = number | boolean | string | number[]

export interface ParamDef {
  name: string
  label?: string
  type: ParamType
  /** absent = the native default applies (the manifest leaves it unset) */
  default?: ParamValue
  /** the method refuses to fit until this parameter is set */
  required?: boolean
  /** the fitted state records this value (a saved model keeps the value it was fitted with) */
  recorded?: boolean
  /** item type of an `array` param */
  itemType?: 'int' | 'float'
  min?: number
  max?: number
  step?: number
  options?: { value: string | number; label: string }[]
  help?: string
}

/** The n4m method a manifest-generated node runs through the generic role API. */
export interface NativeMethodRef {
  methodId: string
  role: 'transformer' | 'selector' | 'regressor' | 'classifier' | 'sample_filter' | 'splitter' | 'augmenter'
  /** fit inputs the method reads beyond X (`y`, class `labels`, the spectral `axis`) */
  inputs: { y: InputUse; labels: InputUse; axis: InputUse }
}
export type InputUse = 'none' | 'optional' | 'required'

/**
 * One node = one operator. The `type` token is what the pipeline DSL and the
 * engine dispatch on. Native nodes are generated from the n4m manifest
 * (./native); hand-written legacy nodes carry their libn4m ABI symbols in `n4m`.
 */
export interface NodeDef {
  /** n4m method id, e.g. 'preprocessing.scatter.snv' */
  id: string
  /** DSL token the engine dispatches on, e.g. 'n4m:preprocessing.scatter.snv' */
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
  /** manifest-generated nodes: the n4m method executed through the role API */
  native?: NativeMethodRef
  /** hand-written nodes: exported libn4m ABI symbols (validated in CI; null fit = stateless) */
  n4m?: { fit: string | null; transform?: string; predict?: string }
  /** Optional JavaScript estimator provider; n4m still owns preprocessing. */
  provider?: 'mljs'
  advanced?: boolean
  /** self-contained models (the AOM/POP family) that screen preprocessing
   *  internally; adding preprocessing steps in front of them is redundant, so the
   *  UI surfaces this before users duplicate work. */
  autonomous?: boolean
  /** for `dag`-category structural operators: the container kind + generator mode
   *  it creates, and the nirs4all-studio CANONICAL flow node id it corresponds to
   *  (e.g. branch.parallel, merge.sources, container.concat_transform,
   *  generator.or). Validated against the studio's generated canonical registry
   *  (src/data/nodes/generated/node-reference.json) by scripts/validate-catalog. */
  dag?: {
    /** the ContainerNode.container token this operator builds */
    container: 'branch' | 'concat_transform' | 'merge' | 'generator'
    /** generator mode (only for container 'generator') */
    mode?: 'or' | 'cartesian'
    /** the nirs4all-studio canonical flow node id this maps to (validation key) */
    studioNodeType: string
  }
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
