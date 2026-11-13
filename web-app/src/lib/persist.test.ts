import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearServerSessionModel, clearSession, loadSession, saveSession } from './persist'
import { serializeTyped, type LoadedModel } from './n4a'

// vitest runs in the node env (no DOM) — provide a minimal localStorage.
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

describe('session persistence', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage()
  })
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: MemStorage }).localStorage
  })

  it('round-trips a pipeline carrying sweeps + the active sample', () => {
    const pipeline = {
      name: 'p',
      steps: [{ id: 's1', type: 'n4m:preprocessing.derivatives.savitzky_golay', params: { window_length: 11 }, sweeps: { window_length: { type: 'or', choices: [7, 11, 15] } } }],
      model: { id: 'm', type: 'n4m:models.pls.pls_regression', params: { n_components: 10 }, sweeps: { n_components: { type: 'range', from: 2, to: 20, step: 2 } } },
      cv: { folds: 5, seed: 42 },
    } as never
    saveSession({ pipeline, model: null, sampleId: 'beer' })
    const s = loadSession()
    expect(s.pipeline).toEqual(pipeline)
    expect(s.sampleId).toBe('beer')
  })

  it('round-trips a pipeline with a split node and an OPTIONAL (omitted) model', () => {
    const pipeline = {
      name: 'split-only',
      split: { id: 'sp', type: 'n4m:splitters.kennard_stone', params: { test_size: 0.3 } },
      steps: [{ id: 's1', type: 'n4m:preprocessing.scatter.snv', params: {} }],
      // model intentionally omitted — preprocessing-only is now valid
      cv: { folds: 5, seed: 42 },
    } as never
    saveSession({ pipeline, sampleId: 'corn' })
    const s = loadSession()
    expect(s.pipeline).toEqual(pipeline)
    expect((s.pipeline as { split?: { type: string } }).split?.type).toBe('n4m:splitters.kennard_stone')
    expect((s.pipeline as { model?: unknown }).model).toBeUndefined()
  })

  it('discards a pipeline whose split references an unknown split operator', () => {
    const pipeline = { name: 'p', split: { id: 'sp', type: 'GhostSplit', params: {} }, steps: [], model: { id: 'm', type: 'n4m:models.pls.pls_regression', params: {} }, cv: { folds: 5, seed: 42 } } as never
    saveSession({ pipeline, sampleId: 'corn' })
    expect(loadSession().pipeline).toBeUndefined()
  })

  it('round-trips an imported model with typed-array coefficients (lossless)', () => {
    const model = {
      name: 'M',
      taskType: 'regression',
      targetName: 'y',
      model: {
        dsl: { name: 'p', steps: [], model: { id: 'm', type: 'n4m:models.pls.pls_regression', params: {} }, cv: { folds: 5, seed: 42 } },
        nFeatures: 3,
        taskType: 'regression',
        state: { chain: [], model: { coefficients: new Float64Array([1.5, 2.5, 3.5]), xMean: new Float64Array([0, 0, 0]) }, backendId: 'libn4m-wasm' },
      },
    } as never
    saveSession({ model, sampleId: null })
    const s = loadSession() as { model: { model: { state: { model: { coefficients: Float64Array } } } } }
    expect(s.model.model.state.model.coefficients).toBeInstanceOf(Float64Array)
    expect(Array.from(s.model.model.state.model.coefficients)).toEqual([1.5, 2.5, 3.5])
  })

  it('discards a stale pipeline that references an operator no longer in the catalog', () => {
    const pipeline = { name: 'p', steps: [{ id: 's', type: 'GhostOperator', params: {} }], model: { id: 'm', type: 'n4m:models.pls.pls_regression', params: {} }, cv: { folds: 5, seed: 42 } } as never
    saveSession({ pipeline, sampleId: 'corn' })
    const s = loadSession()
    expect(s.pipeline).toBeUndefined() // invalid → dropped, App falls back to the default
    expect(s.sampleId).toBe('corn') // the valid parts survive
  })

  it('drops a malformed persisted model rather than trusting it into Predict', () => {
    saveSession({ model: { name: 'X', model: { nope: true } } as never })
    expect(loadSession().model).toBeUndefined()
  })

  it('returns {} for an empty, cleared, or corrupt store (never throws)', () => {
    expect(loadSession()).toEqual({})
    saveSession({ sampleId: 'corn' })
    expect(loadSession().sampleId).toBe('corn')
    clearSession()
    expect(loadSession()).toEqual({})
    ;(globalThis as unknown as { localStorage: MemStorage }).localStorage.setItem('nirs4all-web:session:v2', '{not json')
    expect(loadSession()).toEqual({})
  })

  it('stores typed arrays as exact bytes and never reads or rewrites the v1 namespace', () => {
    const storage = (globalThis as unknown as { localStorage: MemStorage }).localStorage
    const legacy = JSON.stringify({ sampleId: 'beer', model: { model: { dsl: {}, state: { w: { $f64: [1, null] } }, nFeatures: 1 } } })
    storage.setItem('nirs4all-web:session:v1', legacy)
    expect(loadSession()).toEqual({}) // the v1 payload is not loaded
    const special = Float64Array.from([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, 5e-324])
    const model = {
      name: 'M', taskType: 'regression', targetName: 'y',
      model: { dsl: { name: 'p', steps: [], model: { id: 'm', type: 'n4m:models.pls.pls_regression', params: {} }, cv: { folds: 5, seed: 42 } }, nFeatures: 3, taskType: 'regression', state: { chain: [], model: { coefficients: special }, backendId: 'libn4m-wasm' } },
    } as never
    saveSession({ model, sampleId: 'corn' })
    const back = (loadSession() as { model: { model: { state: { model: { coefficients: Float64Array } } } } }).model.model.state.model.coefficients
    expect(Array.from(new Uint8Array(back.buffer))).toEqual(Array.from(new Uint8Array(special.buffer)))
    expect(storage.getItem('nirs4all-web:session:v1')).toBe(legacy) // untouched
  })

  it('ignores the retired nirs4all-lite session key', () => {
    const retired = {
      pipeline: { name: 'p', steps: [], model: { id: 'm', type: 'n4m:models.pls.pls_regression', params: {} }, cv: { folds: 5, seed: 42 } },
      sampleId: 'corn',
    }
    ;(globalThis as unknown as { localStorage: MemStorage }).localStorage.setItem('nirs4all-lite:session:v1', JSON.stringify(retired))
    expect(loadSession()).toEqual({})
  })

  const privateModel: LoadedModel = {
    name: 'private-training-row-sentinel', taskType: 'regression', targetName: 'y',
    model: { dsl: { name: 'Private fitted recipe', steps: [] }, nFeatures: 2, taskType: 'regression', state: { chain: [], model: { containsTrainingRows: true, trainingRows: new Float64Array([1, 2, 3, 4]) } } },
  }

  it('keeps server-origin fitted state out of localStorage while retaining local editor work', () => {
    const pipeline = { name: 'Local editor work', steps: [] }
    saveSession({ pipeline, model: privateModel, modelOrigin: 'server', sampleId: 'corn' })
    const storage = (globalThis as unknown as { localStorage: MemStorage }).localStorage
    const raw = storage.getItem('nirs4all-web:session:v2')!
    expect(raw).not.toContain(privateModel.name)
    expect(raw).not.toContain('trainingRows')
    expect(loadSession().model).toBeNull()
    clearServerSessionModel()
    expect(loadSession().model).toBeNull()
    expect(loadSession().pipeline).toEqual(pipeline)
    expect(loadSession().sampleId).toBe('corn')
  })

  it('removes a marked server model left by an older session without losing the editor', () => {
    const storage = (globalThis as unknown as { localStorage: MemStorage }).localStorage
    storage.setItem('nirs4all-web:session:v2', serializeTyped({ model: privateModel, modelOrigin: 'server', sampleId: 'beer', pipeline: { name: 'Keep editor', steps: [] } }))
    expect(loadSession().model).toBeNull()
    expect(storage.getItem('nirs4all-web:session:v2')).not.toContain(privateModel.name)
    expect(loadSession().sampleId).toBe('beer')
    expect(loadSession().pipeline?.name).toBe('Keep editor')
  })

  it('disconnect cleanup preserves unrelated local models', () => {
    saveSession({ model: privateModel, modelOrigin: 'local', sampleId: 'corn' })
    const storage = (globalThis as unknown as { localStorage: MemStorage }).localStorage
    const before = storage.getItem('nirs4all-web:session:v2')
    clearServerSessionModel()
    expect(storage.getItem('nirs4all-web:session:v2')).toBe(before)
    expect(loadSession().model?.name).toBe(privateModel.name)
  })
})
