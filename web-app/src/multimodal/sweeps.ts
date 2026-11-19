import { fromCanonicalPipeline, toCanonicalPipeline, type PipelineChainDocument } from 'nirs4all-ui/pipelineEditor'
import { operatorName } from './fusion'

/**
 * Parameter sweeps of an edited pipeline, run as variants. Each variant is a
 * complete pipeline with fixed values that the native controller runs with the
 * same folds, out-of-fold predictions, refit and held-out replay as any run;
 * the Inspector compares them. Values follow the nirs4all generator semantics
 * (`_or_` list, `_range_` [from, to, step] with an inclusive end, `_log_range_`
 * [from, to, num]); the combinations are enumerated by Core (`generate`).
 */

/** Each variant is a full cross-validated run: keep one click within minutes. */
export const MAX_VARIANTS = 30

type Json = Record<string, unknown>
type Primitive = number | string | boolean
const record = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value)
const GENERATORS = ['_or_', '_range_', '_log_range_'] as const
const UNSUPPORTED = ['_grid_', '_zip_', '_sample_', '_chain_', '_cartesian_']

interface Site {
  /** Path from the canonical root to the generator node. */
  path: Array<string | number>
  /** Step-level generator (`{class, param, _range_}`): the parameter it sets. */
  stepParam: string | null
  label: string
  values: unknown[]
}

export class SweepError extends Error {
  constructor(message: string) { super(message); this.name = 'SweepError' }
}

function rangeValues(spec: unknown, where: string): number[] {
  const [from, to, step = 1] = Array.isArray(spec) ? spec : record(spec) ? [spec.from, spec.to, spec.step ?? 1] : []
  if (![from, to, step].every(value => typeof value === 'number' && Number.isFinite(value)) || (step as number) <= 0 || (to as number) < (from as number)) {
    throw new SweepError(`${where}: a range needs numeric [from, to, step] with to ≥ from and a positive step.`)
  }
  const values: number[] = []
  const integer = [from, to, step].every(value => Number.isInteger(value))
  for (let index = 0; ; index += 1) {
    const value = (from as number) + index * (step as number)
    if (value > (to as number) + (integer ? 0 : 1e-12 * Math.abs(to as number))) break
    values.push(integer ? value : Number(value.toPrecision(12)))
    if (values.length > 10_000) break
  }
  return values
}

function logRangeValues(spec: unknown, where: string): number[] {
  const [from, to, num] = Array.isArray(spec) ? spec : record(spec) ? [spec.from, spec.to, spec.num] : []
  if (![from, to, num].every(value => typeof value === 'number' && Number.isFinite(value)) || (from as number) <= 0 || (to as number) <= 0 || !Number.isInteger(num) || (num as number) < 2) {
    throw new SweepError(`${where}: a log range needs positive [from, to] and an integer number of points ≥ 2.`)
  }
  const ratio = Math.log((to as number) / (from as number))
  return Array.from({ length: num as number }, (_, index) => Number(((from as number) * Math.exp(ratio * index / ((num as number) - 1))).toPrecision(12)))
}

function values(node: Json, key: (typeof GENERATORS)[number], where: string): unknown[] {
  const spec = node[key]
  if (key === '_or_') {
    if (!Array.isArray(spec) || spec.length === 0) throw new SweepError(`${where}: alternatives need a non-empty list.`)
    return spec
  }
  return key === '_range_' ? rangeValues(spec, where) : logRangeValues(spec, where)
}

function hasGenerator(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasGenerator)
  if (!record(value)) return false
  return Object.keys(value).some(key => key.startsWith('_') && key.endsWith('_')) || Object.values(value).some(hasGenerator)
}

/** Readable text of one swept value. */
export function valueText(value: unknown): string {
  if (typeof value === 'number') return String(Number(value.toPrecision(6)))
  if (typeof value === 'string' || typeof value === 'boolean') return String(value)
  if (record(value)) {
    const reference = record(value.model) ? value.model : value
    if (typeof reference.class === 'string') return operatorName(reference.class)
  }
  return JSON.stringify(value)
}

function sites(canonical: unknown, laneLabel: (id: string) => string): Site[] {
  const found: Site[] = []
  const walk = (node: unknown, path: Array<string | number>, lane: string | null, owner: string | null, param: string | null, laneParent: boolean) => {
    if (Array.isArray(node)) { node.forEach((item, index) => walk(item, [...path, index], lane, owner, null, false)); return }
    if (!record(node)) return
    const keys = Object.keys(node)
    const unsupported = keys.find(key => UNSUPPORTED.includes(key))
    if (unsupported) throw new SweepError(`${unsupported} generators are not run by this laboratory; use a list of values, a range or a log range.`)
    const key = GENERATORS.find(name => name in node)
    const where = [lane ? laneLabel(lane) : null, owner ? operatorName(owner) : null, param].filter(Boolean).join(' · ') || 'Sweep'
    if (key) {
      const stepParam = typeof node.class === 'string' ? node.param : null
      if (typeof node.class === 'string' && typeof stepParam !== 'string') throw new SweepError(`${where}: a step-level generator must name its parameter.`)
      const rest = keys.filter(name => name !== key && !(typeof node.class === 'string' && ['class', 'params', 'param', 'name'].includes(name)))
      if (rest.length) throw new SweepError(`${where}: generator options (${rest.join(', ')}) are not run by this laboratory.`)
      const list = values(node, key, where)
      if (list.some(hasGenerator)) throw new SweepError(`${where}: nested sweeps are not run by this laboratory.`)
      const name = typeof stepParam === 'string' ? stepParam : param
      const label = [lane ? laneLabel(lane) : null, typeof node.class === 'string' ? operatorName(node.class) : owner ? operatorName(owner) : null,
        name ?? (key === '_or_' ? 'alternatives' : null)].filter(Boolean).join(' · ')
      found.push({ path, stepParam: typeof stepParam === 'string' ? stepParam : null, label: label || 'alternatives', values: list })
      return
    }
    const className = typeof node.class === 'string' ? node.class : null
    for (const [name, child] of Object.entries(node)) {
      if (name === 'params' && className && record(child)) {
        for (const [paramName, value] of Object.entries(child)) walk(value, [...path, name, paramName], lane, className, paramName, false)
      } else if (laneParent) {
        walk(child, [...path, name], name, null, null, false)
      } else {
        walk(child, [...path, name], lane, className ?? owner, null, name === 'source_branch' || (name === 'steps' && record(node) && node.by_source === true))
      }
    }
  }
  walk(canonical, [], null, null, null, false)
  // Two sweeps of the same parameter in one place stay distinguishable.
  const seen = new Map<string, number>()
  for (const site of found) {
    const count = (seen.get(site.label) ?? 0) + 1
    seen.set(site.label, count)
    if (count > 1) site.label = `${site.label} #${count}`
  }
  return found
}

export interface SweepPlan {
  /** Number of variants (1 without sweeps). */
  count: number
  labels: string[]
  /** Number of values of each sweep, in label order. */
  sizes: number[]
  /** The pipeline with the given value index for each sweep. */
  variant(indices: readonly number[]): { chain: PipelineChainDocument; choices: Record<string, Primitive> }
}

/** Sweeps of an edited pipeline; throws a readable SweepError for generators the laboratory does not run. */
export function sweepPlan(chain: PipelineChainDocument, laneLabel: (id: string) => string = id => id): SweepPlan {
  const canonical = toCanonicalPipeline(chain) as unknown
  const found = sites(canonical, laneLabel)
  const count = found.reduce((product, site) => product * site.values.length, 1)
  return {
    count,
    labels: found.map(site => site.label),
    sizes: found.map(site => site.values.length),
    variant(indices) {
      const copy = structuredClone(canonical) as Json
      const choices: Record<string, Primitive> = {}
      found.forEach((site, index) => {
        const value = site.values[indices[index] ?? 0]
        const parent = site.path.slice(0, -1).reduce<any>((node, key) => node[key], copy)
        const last = site.path[site.path.length - 1]
        if (site.stepParam) {
          const step = parent[last] as Json
          for (const key of GENERATORS) delete step[key]
          delete step.param
          step.params = { ...(record(step.params) ? step.params : {}), [site.stepParam]: structuredClone(value) }
        } else {
          parent[last] = structuredClone(value)
        }
        choices[site.label] = typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' ? value : valueText(value)
      })
      return { chain: fromCanonicalPipeline(copy as never), choices }
    },
  }
}

export interface SweepVariant {
  chain: PipelineChainDocument
  choices: Record<string, Primitive>
  /** "PLS · n_components = 7, …"; empty without sweeps. */
  label: string
}

/** Every variant of an edited pipeline, combinations enumerated by Core (cartesian, capped). */
export async function expandSweeps(chain: PipelineChainDocument, laneLabel?: (id: string) => string): Promise<SweepVariant[]> {
  const plan = sweepPlan(chain, laneLabel)
  if (plan.labels.length === 0) return [{ chain, choices: {}, label: '' }]
  if (plan.count > MAX_VARIANTS) {
    throw new SweepError(`These sweeps make ${plan.count} variants; the laboratory runs at most ${MAX_VARIANTS} per click (each variant is a full cross-validated run). Narrow a range or remove a sweep.`)
  }
  const { generate } = await import('nirs4all')
  const choices = Object.fromEntries(plan.labels.map((_, index) => [`s${index}`, Array.from({ length: plan.sizes[index] }, (_, value) => value)]))
  const generated = await generate(choices, { strategy: 'cartesian', maxVariants: MAX_VARIANTS }) as Array<{ choices: Record<string, { value: number }> }>
  return generated.map(item => {
    const indices = plan.labels.map((_, index) => item.choices[`s${index}`].value)
    const variant = plan.variant(indices)
    return { ...variant, label: Object.entries(variant.choices).map(([name, value]) => `${name} = ${valueText(value)}`).join(', ') }
  })
}

