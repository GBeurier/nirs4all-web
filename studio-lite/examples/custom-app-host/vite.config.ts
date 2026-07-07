import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'

const studioLiteRoot = path.resolve(__dirname, '../..')

export default defineConfig({
  base: './',
  plugins: [react()],
  root: __dirname,
  resolve: {
    alias: {
      '@nirs4all/methods': path.resolve(studioLiteRoot, './src/engine/wasm/methods/index.js'),
      '@nirs4all/datasets-wasm': path.resolve(studioLiteRoot, './src/engine/wasm/datasets/nirs4all_datasets_wasm.js'),
      '@nirs4all/formats-wasm': path.resolve(studioLiteRoot, './src/engine/wasm/formats/nirs4all_formats_wasm.js'),
      '@nirs4all/io-wasm': path.resolve(studioLiteRoot, './src/engine/wasm/io/nirs4all_io_wasm.js'),
      'dag-ml-data-wasm': path.resolve(studioLiteRoot, './src/engine/wasm/dagml-data/dag_ml_data_wasm.js'),
      'dag-ml-wasm': path.resolve(studioLiteRoot, './src/engine/wasm/dagml/dag_ml_wasm.js'),
      'nirs4all-formats-wasm': path.resolve(studioLiteRoot, './src/engine/wasm/formats/nirs4all_formats_wasm.js'),
      'nirs4all-io-wasm': path.resolve(studioLiteRoot, './src/engine/wasm/io/nirs4all_io_wasm.js'),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
})
