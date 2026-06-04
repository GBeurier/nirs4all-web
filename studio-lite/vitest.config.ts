import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Standalone vitest config (no app/tailwind plugins) so engine unit tests run fast in node.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
