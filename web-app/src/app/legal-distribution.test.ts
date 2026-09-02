import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const appRoot = fileURLToPath(new URL('../../', import.meta.url))
const publicLegalRoot = join(appRoot, 'public', 'legal')

function filesRecursively(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(current, entry.name)
      return entry.isDirectory() ? filesRecursively(root, path) : [relative(root, path)]
    })
    .sort()
}

describe('distributed legal notices', () => {
  it('exposes the complete root legal payload through Vite public assets', () => {
    const rootFiles = [
      'LICENSE',
      'LICENSING.md',
      'LICENSING_FR.md',
      'THIRD_PARTY_NOTICES.md',
      ...filesRecursively(join(repoRoot, 'LICENSES')).map((path) => join('LICENSES', path)),
    ].sort()
    const publicFiles = filesRecursively(publicLegalRoot).filter((path) => path !== 'index.html')

    expect(publicFiles).toEqual(rootFiles)
    for (const path of rootFiles) {
      expect(readFileSync(join(publicLegalRoot, path))).toEqual(readFileSync(join(repoRoot, path)))
    }
  })

  it('keeps the application footer linked to this repository and its legal payload', () => {
    const app = readFileSync(join(appRoot, 'src', 'app', 'App.tsx'), 'utf8')
    const index = readFileSync(join(publicLegalRoot, 'index.html'), 'utf8')

    expect(app).toContain('href="https://github.com/GBeurier/nirs4all-web"')
    expect(app).not.toContain('href="https://github.com/GBeurier/nirs4all"')
    expect(app).toContain('href="./legal/"')
    expect(index).toContain('href="THIRD_PARTY_NOTICES.md"')
    expect(index).toContain('href="LICENSES/CeCILL-2.1.txt"')
    expect(index).toContain('provided without warranty')
  })
})
