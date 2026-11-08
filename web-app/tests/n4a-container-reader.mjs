// Reads an exported Web `.n4a` through Core's own container reader (never a local ZIP
// parser): the verified manifest, the host bundle member and its raw SHA-256.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inspectMethodsArchiveV2Predictors, openN4aContainer } from 'nirs4all'

const OWNER = 'nirs4all.web-host'
const FEATURE = 'nirs4all-web-host@1'
const BUNDLE = 'host/bundle.json'

export async function readWebHostContainer(path) {
  const container = await openN4aContainer(new Uint8Array(await readFile(path)))
  try {
    const manifest = JSON.parse(new TextDecoder().decode(container.manifestBytes()))
    const member = container.member(BUNDLE)
    if (!member) throw new Error(`the container has no ${BUNDLE} member`)
    return {
      manifest,
      bundle: JSON.parse(new TextDecoder().decode(member)),
      memberSha256: createHash('sha256').update(member).digest('hex'),
    }
  } finally {
    container.close()
  }
}

/** Core's refusal text when the Methods-only route is given this container, or null if it was (wrongly) accepted. */
export async function methodsOnlyRefusal(path) {
  try {
    await inspectMethodsArchiveV2Predictors(new Uint8Array(await readFile(path)))
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** Why this is not the declared Web host container, or null when owner, feature, entrypoint and identity all match. */
export function webHostDeclarationProblem({ manifest, memberSha256 }) {
  const [artifact] = manifest.artifacts ?? []
  const [entrypoint] = manifest.entrypoints ?? []
  const inventory = (manifest.members ?? []).find((member) => member.path === BUNDLE)
  if (manifest.schema !== 'nirs4all.n4a.container.v1') return `unexpected container schema ${manifest.schema}`
  if (JSON.stringify(manifest.required_features) !== JSON.stringify([FEATURE])) return 'required_features is not the Web host feature'
  if (manifest.artifacts?.length !== 1 || artifact.owner !== OWNER || artifact.id !== BUNDLE || artifact.kind !== 'model') return 'the bundle artifact is not the declared Web host model'
  if (artifact.content_type?.id !== 'nirs4all.web-host.bundle' || artifact.content_type?.version !== 1) return 'the bundle content type is wrong'
  if (artifact.identity?.fingerprint_profile !== 'sha256.raw.v1') return 'the identity fingerprint profile is wrong'
  if (manifest.entrypoints?.length !== 1 || entrypoint.id !== 'host-predict' || entrypoint.owner !== OWNER || entrypoint.operation !== 'host.predict') return 'the host-predict entrypoint is wrong'
  if (artifact.identity.fingerprint !== memberSha256) return 'the declared fingerprint is not the SHA-256 of the bundle member'
  if (inventory?.sha256 !== memberSha256) return 'the Core inventory SHA-256 is not the SHA-256 of the bundle member'
  return null
}
