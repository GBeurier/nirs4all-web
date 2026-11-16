import { loadDagMlWasm, loadDatasetsWasm, loadMethodsWasm, upstreams } from '../engine/nirs4all-core'
import { N4mWasmSourceController } from 'dag-ml-wasm/n4m-source-controller'

export { N4mWasmSourceController }
export type LabDag = Awaited<ReturnType<typeof loadDagMlWasm>>
export async function loadLabRuntime() {
  const [dag, methods, datasets] = await Promise.all([loadDagMlWasm(), loadMethodsWasm(), loadDatasetsWasm()])
  const hash = (bytes: Uint8Array) => datasets.sha256(bytes)
  const fingerprint = (value: unknown) => hash(new TextEncoder().encode(stableJson(value)))
  return { dag, methods, hash, fingerprint, ownerVersions: {
    dag: dag.dag_ml_version(), methods: methods.version(), methodsAbi: [...methods.abiVersion()].join('.'),
    sourceProfile: 'source_composition.v1', builds: upstreams,
  } }
}
export function stableJson(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (ArrayBuffer.isView(input)) return Array.from(input as unknown as ArrayLike<number>)
    if (Array.isArray(input)) return input.map(canonical)
    if (input && typeof input === 'object') return Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical((input as Record<string, unknown>)[key])]))
    return input
  }
  return JSON.stringify(canonical(value))
}
/** An explicit sentinel keeps native u64 seed numbers exact across JSON text. */
export const SEED_TOKEN = '__nirs4all_lab_exact_native_u64_seed__'
export function nativeJson(value: unknown, seed: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(seed) || BigInt(seed) > 18446744073709551615n) throw new Error('Seed must be an exact decimal u64 string')
  return JSON.stringify(value).replaceAll(JSON.stringify(SEED_TOKEN), seed)
}
