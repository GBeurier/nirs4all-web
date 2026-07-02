import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Standalone vitest config (no app/tailwind plugins) so engine unit tests run fast in node.
export default defineConfig({
  resolve: {
    alias: {
      '@nirs4all/methods-wasm': path.resolve(__dirname, './src/engine/wasm/methods/index.js'),
      '@nirs4all/datasets-wasm': path.resolve(__dirname, './src/engine/wasm/datasets/nirs4all_datasets_wasm.js'),
      'dag-ml-data-wasm': path.resolve(__dirname, './src/engine/wasm/dagml-data/dag_ml_data_wasm.js'),
      'dag-ml-wasm': path.resolve(__dirname, './src/engine/wasm/dagml/dag_ml_wasm.js'),
      'nirs4all-formats-wasm': path.resolve(__dirname, './src/engine/wasm/formats/nirs4all_formats_wasm.js'),
      'nirs4all-io-wasm': path.resolve(__dirname, './src/engine/wasm/io/nirs4all_io_wasm.js'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
