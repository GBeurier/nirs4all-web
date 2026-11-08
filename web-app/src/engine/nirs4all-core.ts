import {
  createDagMlModelManifest,
  createDagMlNodeResult,
  loadDagMlDataWasm as loadDagMlDataWasmRaw,
  loadDagMlWasm as loadDagMlWasmRaw,
  loadDataIoWasm as loadDataIoWasmRaw,
  loadDatasetsWasm as loadDatasetsWasmRaw,
  loadMethodsWasm as loadMethodsWasmRaw,
  loadArchiveV2Native as loadArchiveV2NativeRaw,
  inspectMethodsArchiveV2Predictors as inspectMethodsArchiveV2PredictorsRaw,
  loadPipelineDefinition,
  methodsWasm as methodsWasmRaw,
  openN4aContainer as openN4aContainerRaw,
  portableClassNames,
  replayMethodsArchiveV2 as replayMethodsArchiveV2Raw,
  upstreams,
  writeN4aContainer as writeN4aContainerRaw,
} from 'nirs4all'
import {
  CORE_EXECUTION_PROFILES_JSON,
  CORE_EXECUTION_PROFILES_SHA256,
  CORE_EXECUTION_PROFILES_SOURCE,
} from './core-execution-profiles.generated'

export {
  createDagMlModelManifest,
  createDagMlNodeResult,
  loadPipelineDefinition,
  portableClassNames,
  upstreams,
}

export type MethodsWasmMod = typeof import('./wasm/methods/index.js')
export type DagMlMod = typeof import('./wasm/dagml/dag_ml_wasm.js')
export type DagMlDataMod = typeof import('./wasm/dagml-data/dag_ml_data_wasm.js')
export type DatasetsMod = typeof import('./wasm/datasets/nirs4all_datasets_wasm.js')
export type FormatsMod = typeof import('./wasm/formats/nirs4all_formats_wasm.js')
export type IoMod = typeof import('./wasm/io/nirs4all_io_wasm.js')
export type {
  ArchiveV2ReplayDataset,
  ArchiveV2ReplayResult,
  NativePredictorDescriptorV1,
} from 'nirs4all'

export const loadArchiveV2Native = loadArchiveV2NativeRaw as () => Promise<unknown>
export const inspectMethodsArchiveV2Predictors = inspectMethodsArchiveV2PredictorsRaw
export const replayMethodsArchiveV2 = replayMethodsArchiveV2Raw
/** Core V1 `.n4a` storage (generic container open/write; no payload is executed). */
export const openN4aContainer = openN4aContainerRaw
export const writeN4aContainer = writeN4aContainerRaw

export const loadMethodsWasm = loadMethodsWasmRaw as () => Promise<MethodsWasmMod>
export const methodsWasm = methodsWasmRaw as () => MethodsWasmMod
export const loadDagMlWasm = loadDagMlWasmRaw as () => Promise<DagMlMod>
export const loadDagMlDataWasm = loadDagMlDataWasmRaw as () => Promise<DagMlDataMod>
export const loadDatasetsWasm = loadDatasetsWasmRaw as () => Promise<DatasetsMod>
export const loadDataIoWasm = loadDataIoWasmRaw as () => Promise<{ formats: FormatsMod; io: IoMod }>

export type CoreRuntimeSurface = 'python' | 'javascript_wasm' | 'rust' | 'matlab_octave'
export type CoreProfileOperation = 'compile' | 'fit' | 'predict' | 'import' | 'export'
export interface CoreProfileEntrypoint {
  symbol: string
  source: string
}
export type CoreProfileOperationEntry =
  | { status: 'supported'; entrypoints: CoreProfileEntrypoint[] }
  | { status: 'unsupported'; reason: string }
export interface CoreExecutionProfileDefinition {
  id: 'native-workflow' | 'native-conformal'
  version: 1
  title: string
  surfaces: CoreRuntimeSurface[]
  dependencies: string[]
  runtime_requirements: Record<CoreRuntimeSurface, string[]>
  content_types: { schema: string; owner: string; carried_in: string }[]
  content_routes: {
    operation: CoreProfileOperation
    surface: CoreRuntimeSurface
    route: 'public_return' | 'cli_response' | 'archive_transfer'
    entrypoint: string
    carries: 'host_object' | 'wrapper_json' | 'native_archive_v2'
    schema?: string
    fields?: string[]
    cli_command?: string
    mechanism?: string
    archive_schema_version?: 2
    calibration_in_archive?: string
  }[]
  operations: Record<CoreProfileOperation, Record<CoreRuntimeSurface, CoreProfileOperationEntry>>
  limits: string[]
}
export interface CoreExecutionProfileDefinitions {
  schema: 'nirs4all-core.execution-profiles.v1'
  version: 1
  generated_from: string
  runtime_surfaces: CoreRuntimeSurface[]
  operations: CoreProfileOperation[]
  statuses: ('supported' | 'unsupported')[]
  limits: string[]
  profiles: CoreExecutionProfileDefinition[]
  external_federation: {
    surface: string
    repository: string
    package: string
    core_runtime_surface: false
    status: 'externally-federated'
    profiles: string[]
    contracts: string[]
    evidence: string[]
    entrypoints: { profile: string; operation: CoreProfileOperation; symbol: string }[]
    note: string
  }[]
}

/**
 * Native execution-profile DEFINITIONS generated from the nirs4all-core owner registry.
 * This is metadata only: it does not certify what the pinned numerical shim in
 * `vendor/nirs4all` exports or can run. Each call returns an independent copy.
 */
export function coreExecutionProfileDefinitions(): CoreExecutionProfileDefinitions {
  return JSON.parse(CORE_EXECUTION_PROFILES_JSON) as CoreExecutionProfileDefinitions
}
export const coreExecutionProfileDefinitionsSha256: string = CORE_EXECUTION_PROFILES_SHA256
export const coreExecutionProfileDefinitionsSource: string = CORE_EXECUTION_PROFILES_SOURCE
