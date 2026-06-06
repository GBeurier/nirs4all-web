import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Two build modes:
//  - default      → static site (lazy-loaded WASM), the primary nirs4all.org deliverable
//  - `singlefile` → inline JS+CSS into one HTML (WASM is inlined by scripts/make-standalone.mjs);
//                   `base: './'` keeps asset URLs relative so the file opens under file://
export default defineConfig(({ mode }) => {
  const singlefile = mode === 'singlefile'
  return {
    base: './',
    plugins: [react(), tailwindcss(), ...(singlefile ? [viteSingleFile()] : [])],
    resolve: {
      alias: {
        // singlefile builds swap the engine entry for a Blob-backed classic
        // worker. Listed before '@' so the exact match wins. The served/dev build
        // keeps client.ts, which uses a module worker.
        ...(singlefile ? { '@/engine/client': path.resolve(__dirname, './src/engine/client.singlefile.ts') } : {}),
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
    build: {
      target: 'es2022',
      outDir: singlefile ? 'dist-single' : 'dist',
      chunkSizeWarningLimit: 4096,
    },
  }
})
