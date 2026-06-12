import {
  dagMl,
  dagMlData,
  datasets,
  formats,
  io,
  loadPipelineDefinition,
  methods,
  portableClassNames,
  upstreams,
} from 'nirs4all'

export { loadPipelineDefinition, portableClassNames, upstreams }

export type MethodsWasmMod = typeof import('./wasm/methods/index.js')
export type DagMlMod = typeof import('./wasm/dagml/dag_ml_wasm.js')
export type DagMlDataMod = typeof import('./wasm/dagml-data/dag_ml_data_wasm.js')
export type DatasetsMod = typeof import('./wasm/datasets/nirs4all_datasets_wasm.js')
export type FormatsMod = typeof import('./wasm/formats/nirs4all_formats_wasm.js')
export type IoMod = typeof import('./wasm/io/nirs4all_io_wasm.js')

let methodsPromise: Promise<MethodsWasmMod> | null = null
let methodsModule: MethodsWasmMod | null = null

export async function loadMethodsWasm(): Promise<MethodsWasmMod> {
  if (!methodsPromise) {
    methodsPromise = (async () => {
      const mod = (await methods.import()) as MethodsWasmMod
      await mod.loadModule()
      methodsModule = mod
      return mod
    })()
  }
  return methodsPromise
}

export function methodsWasm(): MethodsWasmMod {
  if (!methodsModule) {
    throw new Error('nirs4all-lite methods WASM is not loaded; call loadMethodsWasm() first.')
  }
  return methodsModule
}

let dagMlPromise: Promise<DagMlMod> | null = null
export async function loadDagMlWasm(): Promise<DagMlMod> {
  if (!dagMlPromise) {
    dagMlPromise = (async () => {
      const mod = (await dagMl.import()) as DagMlMod
      await mod.default()
      return mod
    })()
  }
  return dagMlPromise
}

let dagMlDataPromise: Promise<DagMlDataMod> | null = null
export async function loadDagMlDataWasm(): Promise<DagMlDataMod> {
  if (!dagMlDataPromise) {
    dagMlDataPromise = (async () => {
      const mod = (await dagMlData.import()) as DagMlDataMod
      await mod.default()
      return mod
    })()
  }
  return dagMlDataPromise
}

let datasetsPromise: Promise<DatasetsMod> | null = null
export async function loadDatasetsWasm(): Promise<DatasetsMod> {
  if (!datasetsPromise) {
    datasetsPromise = (async () => {
      const mod = (await datasets.import()) as DatasetsMod
      await mod.default()
      return mod
    })()
  }
  return datasetsPromise
}

let dataIoPromise: Promise<{ formats: FormatsMod; io: IoMod }> | null = null
export async function loadDataIoWasm(): Promise<{ formats: FormatsMod; io: IoMod }> {
  if (!dataIoPromise) {
    dataIoPromise = (async () => {
      const formatsMod = (await formats.import()) as FormatsMod
      const ioMod = (await io.import()) as IoMod
      await formatsMod.default()
      await ioMod.default()
      return { formats: formatsMod, io: ioMod }
    })()
  }
  return dataIoPromise
}
