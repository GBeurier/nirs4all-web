import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Vitest transforms import.meta while the published Core Node initializer uses
// Node's asset resolver. Resolve its one DAG asset through the real npm peer;
// retain staged aliases so browser provider modules and test imports stay shared.
const require = createRequire(pathToFileURL(path.resolve(__dirname, 'package.json')))
const dagAsset = require.resolve('dag-ml-wasm/dag_ml_wasm_bg.wasm')
const stagedDagAsset = path.resolve(__dirname, './src/engine/wasm/dagml/dag_ml_wasm_bg.wasm')
const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')
const expectedDagSha = '4cbdd0671aaf3f51b67f4d7e9161c34fc1effbaee4bc789a8751aef266917620'
if (digest(dagAsset) !== expectedDagSha || digest(stagedDagAsset) !== expectedDagSha) {
  throw new Error('Vitest DAG npm asset and staged browser asset must match authenticated DAG 0.3.41 bytes.')
}
const coreIndex = path.resolve(__dirname, './vendor/nirs4all/src/index.js')
const nodeAssetCall = "import.meta.resolve('dag-ml-wasm/dag_ml_wasm_bg.wasm')"

// Standalone vitest config (no app/tailwind plugins) so engine unit tests run fast in node.
export default defineConfig({
  plugins: [{
    name: 'core-node-wasm-asset',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== coreIndex) return null
      if (code.split(nodeAssetCall).length !== 2) {
        throw new Error('Expected the published Core 0.4.5 Node DAG asset resolver exactly once.')
      }
      return { code: code.replace(nodeAssetCall, JSON.stringify(pathToFileURL(dagAsset).href)), map: null }
    },
  }],
  resolve: {
    alias: {
      '@nirs4all/methods': path.resolve(__dirname, './src/engine/wasm/methods/index.js'),
      '@nirs4all/datasets-wasm': path.resolve(__dirname, './src/engine/wasm/datasets/nirs4all_datasets_wasm.js'),
      '@nirs4all/formats-wasm': path.resolve(__dirname, './src/engine/wasm/formats/nirs4all_formats_wasm.js'),
      '@nirs4all/io-wasm/public-dataset': path.resolve(__dirname, './src/engine/wasm/io/public-dataset.mjs'),
      '@nirs4all/io-wasm': path.resolve(__dirname, './src/engine/wasm/io/nirs4all_io_wasm.js'),
      'dag-ml-data-wasm': path.resolve(__dirname, './src/engine/wasm/dagml-data/dag_ml_data_wasm.js'),
      // Public DAG subpaths must precede the bare package alias.
      'dag-ml-wasm/n4m-estimator-controller': path.resolve(__dirname, './src/engine/wasm/dagml/n4m_estimator_controller.mjs'),
      'dag-ml-wasm/n4m-controller': path.resolve(__dirname, './src/engine/wasm/dagml/n4m_controller.mjs'),
      'dag-ml-wasm/n4m-optimizer': path.resolve(__dirname, './src/engine/wasm/dagml/n4m_hpo_optimizer.mjs'),
      'dag-ml-wasm/multimodal_dataset_replay': path.resolve(__dirname, './src/engine/wasm/dagml/multimodal_dataset_replay.mjs'),
      'dag-ml-wasm/multimodal_dataset_replay.mjs': path.resolve(__dirname, './src/engine/wasm/dagml/multimodal_dataset_replay.mjs'),
      'dag-ml-wasm/dag_ml_wasm_bg.wasm': path.resolve(__dirname, './src/engine/wasm/dagml/dag_ml_wasm_bg.wasm'),
      'dag-ml-wasm': path.resolve(__dirname, './src/engine/wasm/dagml/dag_ml_wasm.js'),
      'nirs4all-formats-wasm': path.resolve(__dirname, './src/engine/wasm/formats/nirs4all_formats_wasm.js'),
      'nirs4all-io-wasm': path.resolve(__dirname, './src/engine/wasm/io/nirs4all_io_wasm.js'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
