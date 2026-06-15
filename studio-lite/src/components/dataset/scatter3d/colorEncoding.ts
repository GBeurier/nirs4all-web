/**
 * Resolve any CSS color (incl. `var(--chart-*)` custom properties) to linear
 * RGBA in [0,1] for the WebGL point cloud. Custom properties are read from
 * `getComputedStyle(document.documentElement)` so the GL path matches the app
 * palette — `var(--chart-1)` must NOT render black. Results are cached.
 */

const cache = new Map<string, [number, number, number, number]>()

// 1x1 canvas used to parse concrete CSS colors (hsl/rgb/#hex/named) to bytes.
let parseCtx: CanvasRenderingContext2D | null = null
function getParseContext(): CanvasRenderingContext2D | null {
  if (parseCtx) return parseCtx
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  parseCtx = canvas.getContext('2d', { willReadFrequently: true })
  return parseCtx
}

const VAR_RE = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/

/**
 * Resolve a `var(--name[, fallback])` expression against the document root.
 * Returns a concrete color string (or the fallback / the raw input on miss).
 */
function resolveVar(css: string): string {
  const match = VAR_RE.exec(css)
  if (!match) return css
  const [, name, fallback] = match
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue(name).trim()
  if (value) return value
  if (fallback) return resolveVar(fallback.trim())
  return css
}

/** Convert any CSS color string to RGBA in [0,1]. Resolves CSS custom properties. */
export function cssToRGBA(css: string): [number, number, number, number] {
  const cached = cache.get(css)
  if (cached) return cached

  const resolved = css.includes('var(') ? resolveVar(css) : css
  const ctx = getParseContext()

  let rgba: [number, number, number, number] = [0.231, 0.51, 0.965, 1]
  if (ctx) {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = resolved
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    rgba = [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255]
  }

  cache.set(css, rgba)
  return rgba
}

/** Clear the resolved-color cache (call when the theme/palette changes). */
export function clearColorCache(): void {
  cache.clear()
}
