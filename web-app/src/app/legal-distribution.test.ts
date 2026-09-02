import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const appRoot = fileURLToPath(new URL('../../', import.meta.url))
const publicLegalRoot = join(appRoot, 'public', 'legal')
const componentRoot = join(publicLegalRoot, 'components')
const componentSources = [
  ['core', join(appRoot, 'vendor', 'nirs4all')],
  ['dagml', join(appRoot, 'src', 'engine', 'wasm', 'dagml')],
  ['dagml-data', join(appRoot, 'src', 'engine', 'wasm', 'dagml-data')],
  ['datasets', join(appRoot, 'src', 'engine', 'wasm', 'datasets')],
  ['formats', join(appRoot, 'src', 'engine', 'wasm', 'formats')],
  ['io', join(appRoot, 'src', 'engine', 'wasm', 'io')],
  ['methods', join(appRoot, 'src', 'engine', 'wasm', 'methods')],
] as const

function filesRecursively(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(current, entry.name)
      return entry.isDirectory() ? filesRecursively(root, path) : [relative(root, path)]
    })
    .sort()
}

function isLegalPayload(path: string): boolean {
  const basename = path.split('/').at(-1)
  return (
    path.startsWith('LICENSES/') ||
    basename === 'LICENSE' ||
    basename === 'LICENSING.md' ||
    basename === 'LICENSING_FR.md' ||
    basename === 'COPY_PROVENANCE.md' ||
    basename === 'NOTICE.md' ||
    basename === 'PROVENANCE.json' ||
    basename === 'PROVENANCE.md' ||
    basename?.startsWith('THIRD_PARTY_') === true ||
    basename?.endsWith('.cdx.json') === true
  )
}

function legalFiles(root: string): string[] {
  const topLevel = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isLegalPayload(entry.name))
    .map((entry) => entry.name)
  const licenses = readdirSync(root, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && entry.name === 'LICENSES',
  )
  if (licenses) {
    topLevel.push(...filesRecursively(join(root, 'LICENSES')).map((path) => join('LICENSES', path)))
  }
  return topLevel.sort()
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
    const publicFiles = filesRecursively(publicLegalRoot).filter(
      (path) => path !== 'index.html' && !path.startsWith('components/'),
    )

    expect(publicFiles).toEqual(rootFiles)
    for (const path of rootFiles) {
      expect(readFileSync(join(publicLegalRoot, path))).toEqual(readFileSync(join(repoRoot, path)))
    }
  })

  it('mirrors each staged component legal payload with a deterministic manifest', () => {
    const manifest = JSON.parse(readFileSync(join(componentRoot, 'manifest.json'), 'utf8'))
    expect(manifest.schema).toBe('nirs4all-web.component-legal.v1')
    expect(manifest.components.map(({ name }: { name: string }) => name)).toEqual(
      componentSources.map(([name]) => name),
    )

    const expectedInventory = ['manifest.json']
    for (const [name, source] of componentSources) {
      const paths = legalFiles(source)
      expect(paths).toContain('LICENSE')
      if (name === 'io') expect(paths).toContain('nirs4all-io-wasm.cdx.json')
      const declaration = manifest.components.find((component: { name: string }) => component.name === name)
      expect(declaration.files.map(({ path }: { path: string }) => path)).toEqual(paths)

      for (const path of paths) {
        const sourceContents = readFileSync(join(source, path))
        const mirrorContents = readFileSync(join(componentRoot, name, path))
        const declared = declaration.files.find((file: { path: string }) => file.path === path)
        expect(mirrorContents).toEqual(sourceContents)
        expect(declared).toEqual({
          path,
          size: sourceContents.length,
          sha256: createHash('sha256').update(sourceContents).digest('hex'),
        })
        expectedInventory.push(join(name, path))
      }
    }
    expect(filesRecursively(componentRoot)).toEqual(expectedInventory.sort())
  })

  it('keeps the application footer linked to this repository and its legal payload', () => {
    const app = readFileSync(join(appRoot, 'src', 'app', 'App.tsx'), 'utf8')
    const index = readFileSync(join(publicLegalRoot, 'index.html'), 'utf8')

    expect(app).toContain('href="https://github.com/GBeurier/nirs4all-web"')
    expect(app).not.toContain('href="https://github.com/GBeurier/nirs4all"')
    expect(app).toContain('href="./legal/"')
    expect(index).toContain('href="THIRD_PARTY_NOTICES.md"')
    expect(index).toContain('href="LICENSES/CeCILL-2.1.txt"')
    expect(index).toContain('href="components/io/nirs4all-io-wasm.cdx.json"')
    expect(index).toContain('href="components/methods/THIRD_PARTY_NOTICES.md"')
    expect(index).toContain('href="components/manifest.json"')
    expect(index).toContain('provided without warranty')
  })
})
