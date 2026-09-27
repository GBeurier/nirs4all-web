import { type N4mManifest, type N4mManifestMethod, type NodeDefinition, projectN4mManifest } from 'nirs4all-ui/nodeRegistry'
import manifest from './n4m-manifest.json'
import type { InputUse, NativeMethodRef, NodeCategory, NodeDef, ParamDef } from './types'

// Native nirs4all-methods nodes, generated from the checked-in n4m manifest
// (scripts/sync-n4m-manifest.mjs) through the shared nirs4all-ui projector. Every
// method whose role the web pipeline can place runs through the generic n4m role
// API (engine/methods/n4m.ts) by method id; the DSL token is the portable
// `n4m:<method_id>` operator token Studio also serializes.

export const N4M_TOKEN_PREFIX = 'n4m:'

/** The DSL token of an n4m method. */
export const n4mToken = (methodId: string): string => `${N4M_TOKEN_PREFIX}${methodId}`

type NativeCategory = Exclude<NodeCategory, 'dag'>

const WEB_CATEGORY: Record<NodeDefinition['type'], NativeCategory> = {
  preprocessing: 'preprocessing',
  model: 'model',
  filter: 'filter',
  splitting: 'split',
  augmentation: 'augmentation',
}

const ICON: Record<NativeCategory, string> = {
  preprocessing: 'Waves',
  model: 'GitBranch',
  split: 'Split',
  filter: 'Filter',
  augmentation: 'Copy',
}

/** Fit inputs the browser pipeline can supply: the targets, the class labels and
 *  the dataset's spectral axis. Methods that require anything else (sample
 *  groups, feature groups, multiblock layout, a transfer target domain, CV fold
 *  ids, sample weights) have no source in a web dataset and get no node. */
const SUPPLIED_INPUTS = new Set(['y', 'labels', 'axis'])

function paramDef(param: NodeDefinition['parameters'][number]): ParamDef {
  return {
    name: param.name,
    label: param.label,
    type: param.type,
    ...(param.default !== undefined && { default: param.default }),
    ...(param.required && { required: true }),
    ...(param.itemType && { itemType: param.itemType }),
    ...(param.min !== undefined && { min: param.min }),
    ...(param.max !== undefined && { max: param.max }),
    ...(param.options && { options: param.options }),
  }
}

const METHODS = new Map((manifest as N4mManifest).methods.map((m) => [m.method_id, m]))

function inputUse(method: N4mManifestMethod, input: 'y' | 'labels' | 'axis'): InputUse {
  return method.inputs[input]
}

function executable(method: N4mManifestMethod): boolean {
  return Object.entries(method.inputs).every(([input, use]) => use !== 'required' || SUPPLIED_INPUTS.has(input))
}

function nativeNode(node: NodeDefinition): NodeDef[] {
  const method = METHODS.get(node.n4m.methodId)!
  const category = WEB_CATEGORY[node.type]
  // A transformer that is also a regressor (PLS, PCR, ...) is placed as the model:
  // one DSL token per method keeps `type` unique across the catalog.
  if (!executable(method) || (category === 'preprocessing' && method.roles.includes('regressor'))) return []
  const native: NativeMethodRef = {
    methodId: method.method_id,
    role: node.n4m.role,
    inputs: { y: inputUse(method, 'y'), labels: inputUse(method, 'labels'), axis: inputUse(method, 'axis') },
  }
  const def: NodeDef = {
    id: method.method_id,
    type: n4mToken(method.method_id),
    name: node.name,
    category,
    subcategory: node.category,
    description: node.description,
    icon: ICON[category],
    params: node.parameters.map(paramDef),
    native,
  }
  if (category === 'model') {
    def.task = node.n4m.role === 'classifier' ? 'binary' : 'regression'
    // The AOM/POP family screens its own operator bank by internal CV on raw X.
    if (method.method_id.startsWith('aom_pop.')) def.autonomous = true
  }
  return [def]
}

const NATIVE_NODES = projectN4mManifest(manifest as N4mManifest).flatMap(nativeNode)

const nativeNodes = (category: NativeCategory): NodeDef[] => NATIVE_NODES.filter((n) => n.category === category)

export const NATIVE_PREPROCESSING_NODES = nativeNodes('preprocessing')
export const NATIVE_MODEL_NODES = nativeNodes('model')
export const NATIVE_SPLIT_NODES = nativeNodes('split')
export const NATIVE_FILTER_NODES = nativeNodes('filter')
export const NATIVE_AUGMENTATION_NODES = nativeNodes('augmentation')
