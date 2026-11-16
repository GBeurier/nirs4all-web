import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadBundledTeachingFile } from './bundled-file'

afterEach(() => vi.unstubAllGlobals())

describe('bundled teaching-file transport', () => {
  it('reads only the selected same-origin static collection without credentials or redirects', async () => {
    vi.stubGlobal('location', new URL('https://web.nirs4all.org/nirs4all_multimodale/'))
    const response = new Response('{}')
    const fetchFile = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchFile)
    expect(await loadBundledTeachingFile('images-spatial', 'sample-001.png')).toBe(response)
    expect(fetchFile).toHaveBeenCalledWith(new URL('https://web.nirs4all.org/multimodal-data/images-spatial/sample-001.png'),
      { mode: 'same-origin', credentials: 'omit', redirect: 'error' })
  })

  it.each(['../target.csv', 'https://example.com/x', '//example.com/x', 'x/y', 'x\\y', '..', '%2fsecret'])('refuses an undeclared file path %s before fetching', async name => {
    vi.stubGlobal('location', new URL('https://web.nirs4all.org/nirs4all_multimodale/'))
    const fetchFile = vi.fn()
    vi.stubGlobal('fetch', fetchFile)
    await expect(loadBundledTeachingFile('images-spatial', name)).rejects.toThrow('flat file name')
    expect(fetchFile).not.toHaveBeenCalled()
  })

  it('refuses arbitrary collections and non-HTTP origins before fetching', async () => {
    const fetchFile = vi.fn()
    vi.stubGlobal('fetch', fetchFile)
    await expect(loadBundledTeachingFile('https://example.com', 'files.json')).rejects.toThrow('declared preset')
    vi.stubGlobal('location', new URL('file:///nirs4all_multimodale/index.html'))
    await expect(loadBundledTeachingFile('images-spatial', 'files.json')).rejects.toThrow('HTTP origin')
    expect(fetchFile).not.toHaveBeenCalled()
  })
})
