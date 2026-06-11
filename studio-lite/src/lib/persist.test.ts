import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSession, loadSession, saveSession } from './persist'

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

  it('round-trips a pipeline carrying sweeps + finetune + the active sample', () => {
    const pipeline = {
      name: 'p',
      steps: [{ id: 's1', type: 'SavitzkyGolay', params: { window: 11 }, sweeps: { window: { type: 'or', choices: [7, 11, 15] } } }],
      model: { id: 'm', type: 'PLS', params: { n_components: 10 } },
      cv: { folds: 5, seed: 42 },
      finetune: { enabled: true, n_trials: 0, params: [{ name: 'n_components', type: 'int', low: 2, high: 20 }] },
    } as never
    saveSession({ pipeline, model: null, sampleId: 'nir-reg' })
    const s = loadSession()
    expect(s.pipeline).toEqual(pipeline)
    expect(s.sampleId).toBe('nir-reg')
  })

  it('round-trips a pipeline with a split node and an OPTIONAL (omitted) model', () => {
    const pipeline = {
      name: 'split-only',
      split: { id: 'sp', type: 'KennardStone', params: { test_size: 0.3 } },
      steps: [{ id: 's1', type: 'StandardNormalVariate', params: {} }],
      // model intentionally omitted — preprocessing-only is now valid
      cv: { folds: 5, seed: 42 },
    } as never
    saveSession({ pipeline, sampleId: 'fruit' })
    const s = loadSession()
    expect(s.pipeline).toEqual(pipeline)
    expect((s.pipeline as { split?: { type: string } }).split?.type).toBe('KennardStone')
    expect((s.pipeline as { model?: unknown }).model).toBeUndefined()
  })

  it('discards a pipeline whose split references an unknown split operator', () => {
    const pipeline = { name: 'p', split: { id: 'sp', type: 'GhostSplit', params: {} }, steps: [], model: { id: 'm', type: 'PLS', params: {} }, cv: { folds: 5, seed: 42 } } as never
    saveSession({ pipeline, sampleId: 'fruit' })
    expect(loadSession().pipeline).toBeUndefined()
  })

  it('round-trips an imported model with typed-array coefficients (lossless)', () => {
    const model = {
      name: 'M',
      taskType: 'regression',
      targetName: 'y',
      model: {
        dsl: { name: 'p', steps: [], model: { id: 'm', type: 'PLS', params: {} }, cv: { folds: 5, seed: 42 } },
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
    const pipeline = { name: 'p', steps: [{ id: 's', type: 'GhostOperator', params: {} }], model: { id: 'm', type: 'PLS', params: {} }, cv: { folds: 5, seed: 42 } } as never
    saveSession({ pipeline, sampleId: 'fruit' })
    const s = loadSession()
    expect(s.pipeline).toBeUndefined() // invalid → dropped, App falls back to the default
    expect(s.sampleId).toBe('fruit') // the valid parts survive
  })

  it('drops a malformed persisted model rather than trusting it into Predict', () => {
    saveSession({ model: { name: 'X', model: { nope: true } } as never })
    expect(loadSession().model).toBeUndefined()
  })

  it('returns {} for an empty, cleared, or corrupt store (never throws)', () => {
    expect(loadSession()).toEqual({})
    saveSession({ sampleId: 'fruit' })
    expect(loadSession().sampleId).toBe('fruit')
    clearSession()
    expect(loadSession()).toEqual({})
    ;(globalThis as unknown as { localStorage: MemStorage }).localStorage.setItem('nirs4all-lite:session:v1', '{not json')
    expect(loadSession()).toEqual({})
  })

  it('loads a legacy nirs4all-lite session key after the nirs4all-web rename', () => {
    const legacy = {
      pipeline: { name: 'p', steps: [], model: { id: 'm', type: 'PLS', params: {} }, cv: { folds: 5, seed: 42 } },
      sampleId: 'fruit',
    }
    ;(globalThis as unknown as { localStorage: MemStorage }).localStorage.setItem('nirs4all-lite:session:v1', JSON.stringify(legacy))
    expect(loadSession().sampleId).toBe('fruit')
  })
})
