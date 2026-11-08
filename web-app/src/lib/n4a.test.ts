import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { plsFit, plsPredict, type PlsModel } from '@/engine/algo/pls'
import { inspectMethodsArchiveV2Predictors, openN4aContainer, writeN4aContainer } from '@/engine/nirs4all-core'
import type { FittedPipeline, RunResult, ScoreNode } from '@/engine/types'
import { buildN4aBundle, deserializeTyped, exportN4aContainer, N4A_VERSION, parseN4a, parseN4aFile, serializeTyped, webHostManifest } from './n4a'

const emptyScore = (id: string): ScoreNode => ({ id, name: id, kind: 'cv', metrics: { rmse: 1, r2: 0.5, n: 3 }, predictions: [], status: 'completed' })

function tinyRun(): RunResult {
  // 3 samples × 4 features, regression
  const X = { data: Float64Array.from([1, 2, 3, 4, 2, 1, 0, 1, 3, 3, 2, 1]), rows: 3, cols: 4 }
  const Y = { data: Float64Array.from([1, 2, 3]), rows: 3, cols: 1 }
  const model = plsFit(X, Y, 2)
  const fitted: FittedPipeline = {
    dsl: { name: 'unit', steps: [], model: { id: 'm', type: 'n4m:models.pls.pls_regression', params: { n_components: 2 } }, cv: { folds: 3, seed: 42 } },
    taskType: 'regression',
    nFeatures: 4,
    state: { chain: [], model, classNames: undefined, backendId: 'js-pls' },
  }
  return {
    id: 'run-x',
    pipelineName: 'unit',
    taskType: 'regression',
    targetName: 'y',
    refit: emptyScore('refit'),
    cv: emptyScore('cv'),
    folds: [],
    seed: 42,
    engine: 'js-pls',
    scoreMetric: 'rmse',
    model: fitted,
    createdAt: '2026-06-04T00:00:00.000Z',
  }
}

/** The exact stored bytes of a typed-array view (offset and length honoured). */
const bytesOf = (view: ArrayBufferView) => Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
const fileOf = (bytes: Uint8Array, name = 'model.n4a') => new File([bytes as BlobPart], name)

describe('host payload typed-array codec (lossless)', () => {
  const nan64 = new Float64Array(new Uint32Array([0xdeadbeef, 0x7ff80001]).buffer) // NaN with a payload
  const nan32 = new Float32Array(new Uint32Array([0x7fc00001]).buffer)
  const f64 = Float64Array.from([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, 0, 5e-324, 1.7976931348623157e308, 0.1, -123456.789])
  const f32 = Float32Array.from([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, 0, 1e-45, 3.4028234663852886e38, 0.1])
  const i32 = Int32Array.from([-2147483648, 2147483647, 0, -1, 1])

  it('round-trips every Float64/Float32/Int32 bit pattern, including NaN payloads, ±Inf and -0', () => {
    const value = { f64, f32, i32, nan64, nan32, empty: new Float64Array(0), u8: Uint8Array.from([0, 255, 7]) }
    const text = serializeTyped(value)
    expect(text).not.toMatch(/"\$(f64|f32|i32)"/)
    const back = deserializeTyped<typeof value>(text)
    for (const key of ['f64', 'f32', 'i32', 'nan64', 'nan32', 'empty', 'u8'] as const) {
      expect(back[key].constructor).toBe(value[key].constructor)
      expect(bytesOf(back[key])).toEqual(bytesOf(value[key]))
    }
    expect(Object.is(back.f64[3], -0)).toBe(true)
    expect(Object.is(back.f32[3], -0)).toBe(true)
    expect(Array.from(back.i32)).toEqual([-2147483648, 2147483647, 0, -1, 1])
  })

  it('serializes only the bytes of a subview (byteOffset/byteLength), not its whole buffer', () => {
    const base = Float64Array.from([10, 20, 30, 40, 50, 60])
    const offsetInts = new Int32Array(new Int32Array([9, 8, 7, 6, 5]).buffer, 4, 3)
    const back = deserializeTyped<{ sub: Float64Array; ints: Int32Array }>(serializeTyped({ sub: base.subarray(2, 5), ints: offsetInts }))
    expect(Array.from(back.sub)).toEqual([30, 40, 50])
    expect(back.sub.buffer.byteLength).toBe(24)
    expect(Array.from(back.ints)).toEqual([8, 7, 6])
  })

  it('refuses a payload that stores the retired lossy number-array tags', () => {
    expect(() => deserializeTyped('{"w":{"$f64":[1,null,3]}}')).toThrow(/unsupported older host payload/i)
    expect(() => deserializeTyped('{"w":{"$i32":[1]}}')).toThrow(/unsupported older host payload/i)
  })

  it('refuses a truncated typed payload', () => {
    expect(() => deserializeTyped('{"w":{"$f64le":"AAAA"}}')).toThrow(/multiple of 8/)
  })
})

describe('.n4a host payload', () => {
  it('round-trips Float64Array losslessly inside the model blob', () => {
    const run = tinyRun()
    const text = serializeTyped(buildN4aBundle(run))
    const back = deserializeTyped<ReturnType<typeof buildN4aBundle>>(text)
    const orig = run.model.state as { model: PlsModel }
    const got = back.model.state as { model: PlsModel }
    expect(back.version).toBe(N4A_VERSION)
    expect(got.model.B).toBeInstanceOf(Float64Array)
    expect(bytesOf(got.model.B)).toEqual(bytesOf(orig.model.B))
    expect(bytesOf(got.model.meanX)).toEqual(bytesOf(orig.model.meanX))
  })

  it('parseN4a yields a model that predicts identically to the original', () => {
    const run = tinyRun()
    const loaded = parseN4a(serializeTyped(buildN4aBundle(run)))
    const Xnew = { data: Float64Array.from([1.5, 1.5, 1.5, 1.5, 3, 2, 1, 0]), rows: 2, cols: 4 }
    const origPred = plsPredict((run.model.state as { model: PlsModel }).model, Xnew)
    const loadedPred = plsPredict((loaded.model.state as { model: PlsModel }).model, Xnew)
    expect(bytesOf(loadedPred.data)).toEqual(bytesOf(origPred.data))
  })

  it('refuses the retired aggregate and lite format tags', () => {
    const run = tinyRun()
    for (const format of ['nirs4all-core/n4a', 'nirs4all-lite/n4a']) {
      expect(() => parseN4a(serializeTyped({ ...buildN4aBundle(run), format }))).toThrow(/missing format tag/)
    }
  })

  it('refuses a host payload of an older version', () => {
    const run = tinyRun()
    expect(() => parseN4a(serializeTyped({ ...buildN4aBundle(run), version: 2 }))).toThrow(/unsupported older encoding/)
    expect(() => parseN4a(serializeTyped({ ...buildN4aBundle(run), version: N4A_VERSION + 1 }))).toThrow(/newer version/)
  })

  it('rejects a non-n4a payload', () => {
    expect(() => parseN4a('{"hello":1}')).toThrow()
    expect(() => parseN4a('not json')).toThrow()
  })
})

describe('Core V1 host container', () => {
  it('declares the Web host owner, feature, entrypoint and the raw SHA-256 of the bundle member', async () => {
    const run = tinyRun()
    const container = await openN4aContainer(await exportN4aContainer(run, run.model))
    try {
      const manifest = JSON.parse(new TextDecoder().decode(container.manifestBytes()))
      expect(manifest).toMatchObject({
        schema: 'nirs4all.n4a.container.v1',
        schema_version: 1,
        required_features: ['nirs4all-web-host@1'],
        physical_profile: 'zip-stored.v1',
        links: [],
        entrypoints: [{
          id: 'host-predict',
          owner: 'nirs4all.web-host',
          operation: 'host.predict',
          root_artifact: 'host/bundle.json',
          input_artifacts: [],
          required_features: ['nirs4all-web-host@1'],
        }],
      })
      expect(manifest.container_id).toMatch(/^container:nirs4all\.web-host\./)
      expect(manifest.artifacts).toHaveLength(1)
      const [artifact] = manifest.artifacts
      expect(artifact).toMatchObject({
        id: 'host/bundle.json',
        kind: 'model',
        owner: 'nirs4all.web-host',
        content_type: { id: 'nirs4all.web-host.bundle', version: 1 },
        identity: { owner: 'nirs4all.web-host', schema: 'nirs4all.web-host.bundle', schema_version: 1, fingerprint_profile: 'sha256.raw.v1' },
        storage: { kind: 'embedded', root_member: 'host/bundle.json', member_paths: ['host/bundle.json'] },
      })
      const member = container.member('host/bundle.json')!
      const digest = createHash('sha256').update(member).digest('hex')
      expect(artifact.identity.fingerprint).toBe(digest)
      expect(manifest.members.find((entry: { path: string }) => entry.path === 'host/bundle.json').sha256).toBe(digest)
    } finally {
      container.close()
    }
  })

  it('re-opens from a File with prediction delta 0, the full recipe and the metrics', async () => {
    const run = tinyRun()
    const loaded = await parseN4aFile(fileOf(await exportN4aContainer(run, run.model)))
    const Xnew = { data: Float64Array.from([1.5, 1.5, 1.5, 1.5, 3, 2, 1, 0]), rows: 2, cols: 4 }
    const before = plsPredict((run.model.state as { model: PlsModel }).model, Xnew)
    const after = plsPredict((loaded.model.state as { model: PlsModel }).model, Xnew)
    expect(bytesOf(after.data)).toEqual(bytesOf(before.data))
    expect(loaded.model.dsl).toEqual(run.model.dsl)
    expect(loaded.name).toBe(run.pipelineName)
    expect(loaded.metrics).toEqual({ cv: run.cv?.metrics, refit: run.refit.metrics })
  })

  it('stays readable but not executable by the Methods-only route, keeping Core\'s refusal', async () => {
    const run = tinyRun()
    await expect(inspectMethodsArchiveV2Predictors(await exportN4aContainer(run, run.model))).rejects.toThrow()
  })

  it('refuses a bare JSON file instead of reading it as a model', async () => {
    const run = tinyRun()
    const bare = new TextEncoder().encode(serializeTyped(buildN4aBundle(run)))
    await expect(parseN4aFile(fileOf(bare))).rejects.toThrow()
  })

  it('refuses tampered container bytes through Core', async () => {
    const run = tinyRun()
    const bytes = await exportN4aContainer(run, run.model)
    const tampered = new Uint8Array(bytes)
    tampered[Math.floor(tampered.length / 2)] ^= 0x01
    await expect(parseN4aFile(fileOf(tampered))).rejects.toThrow()
  })

  it('refuses a host fingerprint that is not the verified inventory SHA-256 of the bundle', async () => {
    const run = tinyRun()
    const payload = new TextEncoder().encode(serializeTyped(buildN4aBundle(run)))
    const forged = await writeN4aContainer(webHostManifest('0'.repeat(64)), [{ path: 'host/bundle.json', bytes: payload }])
    await expect(parseN4aFile(fileOf(forged.archiveBytes))).rejects.toThrow(/fingerprint is not the verified inventory SHA-256/)
  })

  it('refuses a container of another owner by its declared features, never by suffix', async () => {
    const manifest = webHostManifest('0'.repeat(64)) as { required_features: string[]; artifacts: { owner: string; identity: { owner: string } }[]; entrypoints: { owner: string; required_features: string[] }[] }
    manifest.required_features = ['nirs4all-python-host@1']
    manifest.artifacts[0].owner = 'nirs4all.python-host'
    manifest.artifacts[0].identity.owner = 'nirs4all.python-host'
    manifest.entrypoints[0].owner = 'nirs4all.python-host'
    manifest.entrypoints[0].required_features = ['nirs4all-python-host@1']
    const foreign = await writeN4aContainer(manifest, [{ path: 'host/bundle.json', bytes: new TextEncoder().encode('{}') }])
    await expect(parseN4aFile(fileOf(foreign.archiveBytes, 'looks-like-web.n4a'))).rejects.toThrow(/nirs4all-python-host@1.*not executable/)
  })

  // The native-methods-package route (open + replay of the genuine Core V1 Package2) is exercised
  // on the accepted cohort scenario in engine/package2-cohort.test.ts.

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    'refuses an empty or non-safe-integer file size %s before opening it',
    async (size) => {
      const slice = vi.fn()
      const file = { name: 'bounded.n4a', size, slice } as unknown as File
      await expect(parseN4aFile(file)).rejects.toThrow(/empty or its size is not a safe integer/)
      expect(slice).not.toHaveBeenCalled()
    },
  )
})
