import { type N4mManifest, type NodeDefinition, projectN4mManifest } from 'nirs4all-ui/nodeRegistry'
import { LEGACY_DISPATCH } from './legacy-dispatch'
import manifest from './n4m-manifest.json'
import type { NodeCategory, NodeDef, ParamDef } from './types'

// Native nirs4all-methods nodes, generated from the checked-in n4m manifest
// (scripts/sync-n4m-manifest.mjs) through the shared nirs4all-ui projector and
// restricted to the methods the staged WASM dispatcher executes.

const WEB_CATEGORY: Partial<Record<NodeDefinition['type'], Exclude<NodeCategory, 'dag'>>> = {
  preprocessing: 'preprocessing',
  model: 'model',
  splitting: 'split',
}

const ICON: Record<Exclude<NodeCategory, 'dag'>, string> = {
  preprocessing: 'Waves',
  model: 'GitBranch',
  split: 'Split',
}

function paramDef(node: NodeDefinition, name: string): ParamDef {
  const param = node.parameters.find((p) => p.name === name)
  if (!param || param.type === 'array' || param.default === undefined) {
    throw new Error(`${node.n4m.methodId}: no scalar manifest parameter '${name}' with a default`)
  }
  return {
    name,
    label: param.label,
    type: param.type,
    default: param.default,
    ...(param.min !== undefined && { min: param.min }),
    ...(param.max !== undefined && { max: param.max }),
    ...(param.options && { options: param.options }),
  }
}

const PROJECTED = projectN4mManifest(manifest as N4mManifest)

function nativeNodes(category: Exclude<NodeCategory, 'dag'>): NodeDef[] {
  return PROJECTED.flatMap((node) => {
    const dispatch = LEGACY_DISPATCH[category][node.n4m.methodId]
    if (WEB_CATEGORY[node.type] !== category || !dispatch) return []
    const def: NodeDef = {
      id: node.n4m.methodId,
      type: dispatch.token,
      name: node.name,
      category,
      subcategory: node.category,
      description: node.description,
      icon: ICON[category],
      params: dispatch.params.map((name) => paramDef(node, name)),
    }
    if (category === 'model') def.task = node.n4m.role === 'classifier' ? 'binary' : 'regression'
    if (dispatch.classifiable) def.classifiable = true
    return [def]
  })
}

export const NATIVE_PREPROCESSING_NODES = nativeNodes('preprocessing')
export const NATIVE_MODEL_NODES = nativeNodes('model')
export const NATIVE_SPLIT_NODES = nativeNodes('split')
