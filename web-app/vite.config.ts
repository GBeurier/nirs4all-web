import { defineConfig } from 'vite'
import path from 'node:path'
import packageJson from './package.json'
import publicPackages from './scripts/public-packages.v1.json'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { runtimeProfileForBuildMode, type WebRuntimeProfile, webRuntimePolicy } from './src/engine/web-profile'

// Two build modes:
//  - default      → static site (lazy-loaded WASM), the primary web.nirs4all.org deliverable
//  - `singlefile` → inline JS+CSS+WASM into one HTML through vite-plugin-singlefile;
//                   `base: './'` keeps asset URLs relative so the file opens under file://
export default defineConfig(({ mode }) => {
  const singlefile = mode === 'singlefile'
  // Standard production and the offline single-file builds are the strict browser product
  // (owner DAG-ML route, no compatibility fallback). Development and test stay transitional.
  const runtimeProfile: WebRuntimeProfile = runtimeProfileForBuildMode(mode)
  const runtimePolicy = webRuntimePolicy(runtimeProfile)
  return {
    base: './',
    define: {
      __N4A_WEB_RUNTIME_PROFILE__: JSON.stringify(runtimeProfile),
    },
    plugins: [
      react(),
      tailwindcss(),
      ...(singlefile ? [viteSingleFile()] : []),
      ...[{
        name: 'nirs4all-web-runtime-profile',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'nirs4all-web-version.json',
            source: `${JSON.stringify({
              version: packageJson.version,
              upstreams: Object.fromEntries(Object.entries(publicPackages).map(([key, pin]) => [key, pin.version])),
              ui: '0.2.1',
            }, null, 2)}\n`,
          })
          this.emitFile({
            type: 'asset',
            fileName: 'nirs4all-web-profile.v1.json',
            source: `${JSON.stringify({
              contract: 'nirs4all.web-runtime-profile.v1',
              ...runtimePolicy,
            }, null, 2)}\n`,
          })
        },
      }],
    ],
    resolve: {
      alias: {
        // singlefile builds swap the engine entry for a Blob-backed classic
        // worker. Listed before '@' so the exact match wins. The served/dev build
        // keeps client.ts, which uses a module worker.
        ...(singlefile ? { '@/engine/client': path.resolve(__dirname, './src/engine/client.singlefile.ts') } : {}),
        // Same swap for the owner-preview worker: served keeps a real-URL module
        // worker (chunks resolve against its asset URL); singlefile stays inline.
        ...(singlefile ? { '@/engine/preview-worker': path.resolve(__dirname, './src/engine/preview-worker.singlefile.ts') } : {}),
        '@nirs4all/methods': path.resolve(__dirname, './src/engine/wasm/methods/index.js'),
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
        '@nirs4all/datasets-wasm': path.resolve(
          __dirname,
          './src/engine/wasm/datasets/nirs4all_datasets_wasm.js',
        ),
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Served: module worker with code-split WASM chunks. Single-file: inline
    // classic Blob worker; Chrome refuses Blob *module* workers on file://.
    worker: {
      format: singlefile ? 'iife' : 'es',
      ...(singlefile ? { rollupOptions: { output: { inlineDynamicImports: true } } } : {}),
    },
    assetsInclude: ['**/*.csv', '**/*.wasm'],
    ssr: {
      noExternal: ['nirs4all'],
    },
    build: {
      target: 'es2022',
      outDir: singlefile ? 'dist-single' : mode === 'strict' ? 'dist-strict' : mode === 'transitional' ? 'dist-transitional' : 'dist',
      chunkSizeWarningLimit: 4096,
    },
  }
})
