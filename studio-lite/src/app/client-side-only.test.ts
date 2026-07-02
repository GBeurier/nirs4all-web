import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// web.nirs4all.org is a client-side-only app: everything runs in the browser
// through staged WASM. This test freezes that as a contract — app sources may
// not talk to a server backend or assume a Node runtime. Only the staged WASM
// glue (vendor output under src/engine/wasm/) fetches its own same-origin
// static assets, so it is excluded from the scan.
const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url))

const EXCLUDED_DIRS = new Set(['wasm'])

function walkSources(dir: string, out: { app: string[]; scripts: string[] }): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) && relative(SRC_ROOT, path).split(sep).includes('wasm')) continue
      walkSources(path, out)
      continue
    }
    if (/\.(js|jsx|cjs|mjs)$/.test(entry.name)) {
      // Plain JS in src/ is reserved for the staged WASM glue (excluded above);
      // anything else dodges both the typechecker and this scan.
      out.scripts.push(relative(SRC_ROOT, path))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    if (/\.test\.(ts|tsx)$|\.d\.ts$/.test(entry.name)) continue
    out.app.push(path)
  }
}

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bfetch\s*\(/, why: 'app sources must not fetch — data stays local (uploads, samples, staged WASM)' },
  { pattern: /XMLHttpRequest/, why: 'no HTTP client in the app shell' },
  { pattern: /new WebSocket\s*\(/, why: 'no realtime server channel' },
  { pattern: /\bEventSource\s*\(/, why: 'no server-sent events' },
  { pattern: /\bprocess\.env\b/, why: 'no Node runtime assumption in browser sources (use import.meta.env)' },
  { pattern: /from\s+['"]node:/, why: 'no Node builtin imports in browser sources' },
  { pattern: /\brequire\s*\(/, why: 'no CJS require in browser sources' },
  { pattern: /['"`]\/api\//, why: 'no backend API routes' },
  { pattern: /https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/, why: 'no hardcoded local server origin' },
]

describe('client-side-only contract', () => {
  it('keeps app sources free of server-backend and Node-runtime assumptions', () => {
    const sources = { app: [] as string[], scripts: [] as string[] }
    walkSources(SRC_ROOT, sources)
    const files = sources.app
    expect(files.length).toBeGreaterThan(50) // sanity: the walk actually saw the app
    expect(sources.scripts, 'plain JS outside src/engine/wasm/ escapes typecheck and this scan').toEqual([])

    const violations: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const { pattern, why } of FORBIDDEN) {
        const match = pattern.exec(text)
        if (!match) continue
        const line = text.slice(0, match.index).split('\n').length
        violations.push(`${relative(SRC_ROOT, file)}:${line} — ${pattern} (${why})`)
      }
    }

    expect(violations, violations.join('\n')).toEqual([])
  })
})
