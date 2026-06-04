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
      alias: { '@': path.resolve(__dirname, './src') },
    },
    // classic (iife) workers instantiate from a blob under file:// (module blob
    // workers are blocked there) — required for the single-file deliverable.
    worker: { format: 'iife' },
    assetsInclude: ['**/*.csv', '**/*.wasm'],
    build: {
      target: 'es2022',
      outDir: singlefile ? 'dist-single' : 'dist',
      chunkSizeWarningLimit: 4096,
    },
  }
})
