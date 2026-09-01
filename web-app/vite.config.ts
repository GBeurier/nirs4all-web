import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { type WebRuntimeProfile, webRuntimePolicy } from './src/engine/web-profile'

// Two build modes:
//  - default      → static site (lazy-loaded WASM), the primary web.nirs4all.org deliverable
//  - `singlefile` → inline JS+CSS+WASM into one HTML through vite-plugin-singlefile;
//                   `base: './'` keeps asset URLs relative so the file opens under file://
export default defineConfig(({ mode }) => {
  const singlefile = mode === 'singlefile'
  // Standard production builds are the strict browser product. Development,
  // test and the explicit single-file compatibility build remain transitional.
  const strict = mode === 'production' || mode === 'strict'
  const runtimeProfile: WebRuntimeProfile = strict ? 'strict-wasm' : 'transitional'
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
      ...(!singlefile ? [{
        name: 'nirs4all-web-runtime-profile',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'nirs4all-web-profile.v1.json',
            source: `${JSON.stringify({
              contract: 'nirs4all.web-runtime-profile.v1',
              ...runtimePolicy,
            }, null, 2)}\n`,
          })
        },
      }] : []),
    ],
    resolve: {
      alias: {
        // singlefile builds swap the engine entry for a Blob-backed classic
        // worker. Listed before '@' so the exact match wins. The served/dev build
        // keeps client.ts, which uses a module worker.
        ...(singlefile ? { '@/engine/client': path.resolve(__dirname, './src/engine/client.singlefile.ts') } : {}),
        '@nirs4all/methods': path.resolve(__dirname, './src/engine/wasm/methods/index.js'),
        '@nirs4all/formats-wasm': path.resolve(__dirname, './src/engine/wasm/formats/nirs4all_formats_wasm.js'),
        '@nirs4all/io-wasm': path.resolve(__dirname, './src/engine/wasm/io/nirs4all_io_wasm.js'),
        'dag-ml-data-wasm': path.resolve(__dirname, './src/engine/wasm/dagml-data/dag_ml_data_wasm.js'),
        'dag-ml-wasm': path.resolve(__dirname, './src/engine/wasm/dagml/dag_ml_wasm.js'),
        'nirs4all-formats-wasm': path.resolve(__dirname, './src/engine/wasm/formats/nirs4all_formats_wasm.js'),
        'nirs4all-io-wasm': path.resolve(__dirname, './src/engine/wasm/io/nirs4all_io_wasm.js'),
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
