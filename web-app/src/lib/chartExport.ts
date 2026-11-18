// Save a rendered chart (the first <svg> or <canvas> inside a container) as SVG or PNG.
// Pure DOM serialization of what is on screen; no chart data is recomputed.

function save(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Copy the computed colours of the live SVG onto the clone so the file renders without the app CSS. */
function inlineStyles(source: SVGElement, clone: SVGElement): void {
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline']
  const src = [source, ...Array.from(source.querySelectorAll('*'))] as Element[]
  const dst = [clone, ...Array.from(clone.querySelectorAll('*'))] as Element[]
  src.forEach((el, i) => {
    const cs = getComputedStyle(el)
    const style = props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';')
    dst[i]?.setAttribute('style', `${dst[i].getAttribute('style') ?? ''};${style}`)
  })
}

function serializeSvg(svg: SVGSVGElement): { text: string; width: number; height: number } {
  const box = svg.getBoundingClientRect()
  const clone = svg.cloneNode(true) as SVGSVGElement
  inlineStyles(svg, clone)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(Math.round(box.width)))
  clone.setAttribute('height', String(Math.round(box.height)))
  const bg = getComputedStyle(document.body).backgroundColor
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  clone.insertBefore(rect, clone.firstChild)
  rect.setAttribute('width', '100%')
  rect.setAttribute('height', '100%')
  rect.setAttribute('fill', bg)
  return { text: new XMLSerializer().serializeToString(clone), width: box.width, height: box.height }
}

export function canExportChart(container: HTMLElement | null): boolean {
  return !!container?.querySelector('svg, canvas')
}

export async function exportChart(container: HTMLElement | null, filename: string, format: 'svg' | 'png'): Promise<void> {
  if (!container) return
  const canvas = container.querySelector('canvas')
  const svg = container.querySelector('svg')
  if (format === 'svg') {
    if (!svg) throw new Error('This chart is drawn on a canvas; export it as PNG.')
    save(`${filename}.svg`, new Blob([serializeSvg(svg).text], { type: 'image/svg+xml' }))
    return
  }
  if (canvas && (!svg || canvas.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING)) {
    canvas.toBlob((b) => b && save(`${filename}.png`, b), 'image/png')
    return
  }
  if (!svg) return
  const { text, width, height } = serializeSvg(svg)
  const img = new Image()
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('The chart could not be rasterized.'))
    img.src = url
  })
  const scale = 2
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(width * scale))
  out.height = Math.max(1, Math.round(height * scale))
  const g = out.getContext('2d')
  g?.scale(scale, scale)
  g?.drawImage(img, 0, 0, width, height)
  URL.revokeObjectURL(url)
  out.toBlob((b) => b && save(`${filename}.png`, b), 'image/png')
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  save(filename, new Blob([text], { type: mime }))
}
