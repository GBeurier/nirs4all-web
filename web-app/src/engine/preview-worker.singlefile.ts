// Single-file (file://) owner-preview worker factory. vite.config.ts aliases
// `@/engine/preview-worker` to this module in `singlefile` mode. It uses the same
// inline classic worker packaging as `client.singlefile.ts` (iife with
// inlineDynamicImports), because Chrome refuses Blob module workers on file://.
import InlineEngineWorker from './worker?worker&inline'

export function createPreviewWorker(): Worker {
  return new InlineEngineWorker()
}
