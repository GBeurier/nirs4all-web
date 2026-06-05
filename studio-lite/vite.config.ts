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
        // singlefile builds swap the engine entry for a worker-free, in-thread
        // one so the Web Worker (and its WASM code-split chunks, which can't be
        // inlined into one HTML) never enters the graph. Listed before '@' so the
        // exact match wins. The served/dev build keeps client.ts (WorkerEngine).
        ...(singlefile ? { '@/engine/client': path.resolve(__dirname, './src/engine/client.singlefile.ts') } : {}),
        '@': path.resolve(__dirname, './src'),
      },
    },
    // The served build runs the engine in a MODULE worker so it can code-split its
    // WASM via dynamic import() (IIFE/UMD workers can't). The single-file build has
    // no worker at all (see the alias above).
    worker: { format: 'es' },
    assetsInclude: ['**/*.csv', '**/*.wasm'],
    build: {
      target: 'es2022',
      outDir: singlefile ? 'dist-single' : 'dist',
      chunkSizeWarningLimit: 4096,
    },
  }
})
