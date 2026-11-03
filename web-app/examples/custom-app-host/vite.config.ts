import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'

const webAppRoot = path.resolve(__dirname, '../..')

export default defineConfig({
  base: './',
  plugins: [react()],
  root: __dirname,
  resolve: {
    alias: {
      '@nirs4all/io-wasm/public-dataset': path.resolve(webAppRoot, './src/engine/wasm/io/public-dataset.mjs'),
      'dag-ml-wasm/n4m-estimator-controller': path.resolve(webAppRoot, './src/engine/wasm/dagml/n4m_estimator_controller.mjs'),
      'dag-ml-wasm/n4m-controller': path.resolve(webAppRoot, './src/engine/wasm/dagml/n4m_controller.mjs'),
      'dag-ml-wasm/n4m-optimizer': path.resolve(webAppRoot, './src/engine/wasm/dagml/n4m_hpo_optimizer.mjs'),
      'dag-ml-wasm/multimodal_dataset_replay.mjs': path.resolve(webAppRoot, './src/engine/wasm/dagml/multimodal_dataset_replay.mjs'),
      'dag-ml-wasm/multimodal_dataset_replay': path.resolve(webAppRoot, './src/engine/wasm/dagml/multimodal_dataset_replay.mjs'),
      'dag-ml-wasm/dag_ml_wasm_bg.wasm': path.resolve(webAppRoot, './src/engine/wasm/dagml/dag_ml_wasm_bg.wasm'),
      '@nirs4all/methods': path.resolve(webAppRoot, './src/engine/wasm/methods/index.js'),
      '@nirs4all/datasets-wasm': path.resolve(webAppRoot, './src/engine/wasm/datasets/nirs4all_datasets_wasm.js'),
      '@nirs4all/formats-wasm': path.resolve(webAppRoot, './src/engine/wasm/formats/nirs4all_formats_wasm.js'),
      '@nirs4all/io-wasm': path.resolve(webAppRoot, './src/engine/wasm/io/nirs4all_io_wasm.js'),
      'dag-ml-data-wasm': path.resolve(webAppRoot, './src/engine/wasm/dagml-data/dag_ml_data_wasm.js'),
      'dag-ml-wasm': path.resolve(webAppRoot, './src/engine/wasm/dagml/dag_ml_wasm.js'),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
})
