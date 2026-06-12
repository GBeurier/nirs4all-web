import {
  loadDagMlDataWasm as loadDagMlDataWasmRaw,
  loadDagMlWasm as loadDagMlWasmRaw,
  loadDataIoWasm as loadDataIoWasmRaw,
  loadDatasetsWasm as loadDatasetsWasmRaw,
  loadMethodsWasm as loadMethodsWasmRaw,
  loadPipelineDefinition,
  methodsWasm as methodsWasmRaw,
  parseExecutionPlan,
  portableClassNames,
  predictPortablePipeline,
  runPortablePipeline,
  upstreams,
} from 'nirs4all'

export { loadPipelineDefinition, parseExecutionPlan, portableClassNames, predictPortablePipeline, runPortablePipeline, upstreams }

export type MethodsWasmMod = typeof import('./wasm/methods/index.js')
export type DagMlMod = typeof import('./wasm/dagml/dag_ml_wasm.js')
export type DagMlDataMod = typeof import('./wasm/dagml-data/dag_ml_data_wasm.js')
export type DatasetsMod = typeof import('./wasm/datasets/nirs4all_datasets_wasm.js')
export type FormatsMod = typeof import('./wasm/formats/nirs4all_formats_wasm.js')
export type IoMod = typeof import('./wasm/io/nirs4all_io_wasm.js')
export type { PortableExecutionResult, PortablePlsModel, PortablePredictionResult } from 'nirs4all'

export const loadMethodsWasm = loadMethodsWasmRaw as () => Promise<MethodsWasmMod>
export const methodsWasm = methodsWasmRaw as () => MethodsWasmMod
export const loadDagMlWasm = loadDagMlWasmRaw as () => Promise<DagMlMod>
export const loadDagMlDataWasm = loadDagMlDataWasmRaw as () => Promise<DagMlDataMod>
export const loadDatasetsWasm = loadDatasetsWasmRaw as () => Promise<DatasetsMod>
export const loadDataIoWasm = loadDataIoWasmRaw as () => Promise<{ formats: FormatsMod; io: IoMod }>
