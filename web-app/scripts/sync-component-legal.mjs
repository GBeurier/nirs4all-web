import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
const publicRoot = join(appRoot, 'public', 'legal', 'components')
const check = process.argv.includes('--check')
const distArg = process.argv.find((argument) => argument.startsWith('--dist='))
const distRoot = distArg ? resolve(appRoot, distArg.slice('--dist='.length), 'legal', 'components') : undefined

const components = Object.freeze([
  { name: 'core', source: join(appRoot, 'vendor', 'nirs4all') },
  { name: 'dagml', source: join(appRoot, 'src', 'engine', 'wasm', 'dagml') },
  { name: 'dagml-data', source: join(appRoot, 'src', 'engine', 'wasm', 'dagml-data') },
  { name: 'datasets', source: join(appRoot, 'src', 'engine', 'wasm', 'datasets') },
  { name: 'formats', source: join(appRoot, 'src', 'engine', 'wasm', 'formats') },
  { name: 'io', source: join(appRoot, 'src', 'engine', 'wasm', 'io') },
  { name: 'methods', source: join(appRoot, 'src', 'engine', 'wasm', 'methods') },
])

const toPortablePath = (path) => path.split(sep).join('/')
const sha256 = (contents) => createHash('sha256').update(contents).digest('hex')

function inventory(root) {
  if (!existsSync(root)) return []
  const files = []
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      const metadata = lstatSync(absolute)
      if (metadata.isSymbolicLink()) throw new Error(`legal payload must not contain symlinks: ${absolute}`)
      if (metadata.isDirectory()) visit(absolute)
      else if (metadata.isFile()) files.push(toPortablePath(relative(root, absolute)))
      else throw new Error(`unsupported legal payload entry: ${absolute}`)
    }
  }
  visit(root)
  return files.sort()
}

function isLegalPayload(path) {
  const basename = path.split('/').at(-1)
  return (
    path.startsWith('LICENSES/') ||
    basename === 'LICENSE' ||
    basename === 'THIRD_PARTY_NOTICES.md' ||
    basename === 'LICENSING.md' ||
    basename === 'LICENSING_FR.md' ||
    basename === 'COPY_PROVENANCE.md' ||
    basename === 'NOTICE.md' ||
    basename === 'PROVENANCE.json' ||
    basename === 'PROVENANCE.md' ||
    basename?.startsWith('THIRD_PARTY_') ||
    basename?.endsWith('.cdx.json')
  )
}

function legalInventory(root) {
  const files = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name)
    const metadata = lstatSync(absolute)
    if (metadata.isSymbolicLink()) throw new Error(`staged legal payload must not contain symlinks: ${absolute}`)
    if (metadata.isFile() && isLegalPayload(entry.name)) files.push(entry.name)
    if (metadata.isDirectory() && entry.name === 'LICENSES') {
      files.push(...inventory(absolute).map((path) => `LICENSES/${path}`))
    }
  }
  return files.sort()
}

const payload = components.map(({ name, source }) => {
  if (!existsSync(source)) throw new Error(`missing staged component: ${source}`)
  const files = legalInventory(source)
  if (!files.includes('LICENSE')) throw new Error(`component ${name} has no distributed LICENSE`)
  if (name === 'io' && !files.includes('nirs4all-io-wasm.cdx.json')) {
    throw new Error('nirs4all-io legal distribution requires its CycloneDX SBOM')
  }
  return {
    name,
    source,
    files: files.map((path) => {
      const contents = readFileSync(join(source, path))
      return { path, size: contents.length, sha256: sha256(contents) }
    }),
  }
})

const manifest = `${JSON.stringify({
  schema: 'nirs4all-web.component-legal.v1',
  components: payload.map(({ name, files }) => ({ name, files })),
}, null, 2)}\n`

function verifyMirror(root, label) {
  if (!existsSync(root)) throw new Error(`missing ${label} legal component root: ${root}`)
  const expected = [
    'manifest.json',
    ...payload.flatMap(({ name, files }) => files.map(({ path }) => `${name}/${path}`)),
  ].sort()
  const actual = inventory(root)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} legal inventory mismatch: actual=${actual.join(', ')} expected=${expected.join(', ')}`)
  }
  if (readFileSync(join(root, 'manifest.json'), 'utf8') !== manifest) {
    throw new Error(`${label} legal manifest is stale`)
  }
  for (const { name, source, files } of payload) {
    for (const file of files) {
      const sourceContents = readFileSync(join(source, file.path))
      const mirrorContents = readFileSync(join(root, name, file.path))
      if (!sourceContents.equals(mirrorContents) || mirrorContents.length !== file.size || sha256(mirrorContents) !== file.sha256) {
        throw new Error(`${label} legal payload differs from staged ${name}/${file.path}`)
      }
    }
  }
}

if (!check) {
  rmSync(publicRoot, { recursive: true, force: true })
  for (const { name, source, files } of payload) {
    for (const file of files) {
      const destination = join(publicRoot, name, file.path)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(join(source, file.path), destination)
    }
  }
  mkdirSync(publicRoot, { recursive: true })
  writeFileSync(join(publicRoot, 'manifest.json'), manifest)
}

verifyMirror(publicRoot, 'public')
if (distRoot) verifyMirror(distRoot, 'built dist')
console.log(`component legal payload verified (${payload.length} components${distRoot ? ', built dist included' : ''})`)
