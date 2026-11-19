/** Restricted same-origin transport for the bundled teaching collections. */
const PRESET_IDS = new Set(['spectroscopy-complementary', 'genetics-replicates', 'images-spatial', 'rice-varieties'])

export async function loadBundledTeachingFile(presetId: string, name: string): Promise<Response> {
  if (!PRESET_IDS.has(presetId) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error('A bundled teaching file requires a declared preset and a flat file name')
  }
  const page = new URL(location.href)
  const url = new URL(`../multimodal-data/${presetId}/${encodeURIComponent(name)}`, page)
  if (!['https:', 'http:'].includes(page.protocol) || url.origin !== page.origin) {
    throw new Error('Bundled teaching files require the current HTTP origin')
  }
  return fetch(url, { mode: 'same-origin', credentials: 'omit', redirect: 'error' })
}
