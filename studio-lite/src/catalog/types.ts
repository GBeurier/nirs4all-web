import type { TaskType } from '@/engine/types'

export type NodeCategory = 'preprocessing' | 'model' | 'split' | 'dag'
export type ParamType = 'int' | 'float' | 'bool' | 'select' | 'operators'

/** A single editable parameter value as carried by the pipeline DSL. The
 *  `operators` param type carries an `int[]` (n4m_operator_kind_t bank). */
export type ParamValue = number | boolean | string | number[]

export interface ParamDef {
  name: string
  label?: string
  type: ParamType
  default: ParamValue
  min?: number
  max?: number
  step?: number
  options?: { value: string | number; label: string }[]
  help?: string
}

/** The strict-linear operator kinds the AOM / POP selectors accept as a bank.
 *  Values are n4m_operator_kind_t ints (see nirs4all-methods/cpp/include/n4m/
 *  pls.h §15); non-strict operators (SNV, MSC, ...) are rejected by libn4m and
 *  are intentionally absent. `label` is the picker text. */
export const AOM_OPERATOR_KINDS: { value: number; label: string }[] = [
  { value: 0, label: 'Identity' },
  { value: 7, label: 'Detrend (poly)' },
  { value: 8, label: 'SG smooth' },
  { value: 9, label: 'SG derivative' },
  { value: 10, label: 'Norris–Williams' },
  { value: 15, label: 'Finite difference' },
  { value: 17, label: 'FCK' },
]

/** Default AOM/POP operator bank. Identity + the strict-linear derivative /
 *  detrend family the libn4m AOM screen accepts, now including Norris–Williams
 *  (10) and FCK (17) so the default screen spans the full shipped kind set. */
export const AOM_DEFAULT_BANK: number[] = [0, 7, 8, 9, 10, 15, 17]

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
  /** self-contained models (e.g. AOM/POP) that screen preprocessing internally;
   *  adding preprocessing steps in front of them is redundant, so the UI surfaces
   *  this before users duplicate work. */
  autonomous?: boolean
  /** a regression-default model that can ALSO classify via one-hot Y + argmax
   *  (exactly like PLS-DA) — surfaced in the classification model picker without
   *  changing its regression `task`. Verified multi-target-capable in libn4m. */
  classifiable?: boolean
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
