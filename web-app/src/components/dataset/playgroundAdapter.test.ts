import { describe, expect, it, vi } from 'vitest'
import type { InputUse, NodeDef } from '@/catalog/types'
import type { MaterializedDataset } from '@/engine/types'
import { PLAYGROUND_OPERATORS, playgroundDataset, playgroundDatasetKey, playgroundSelectionIds } from './playgroundAdapter'

// Keep the actual manifest catalog (including SNV/SG); add target-input probes
// so required-label refusal is exercised even if no current transformer needs it.
vi.mock('@/catalog/nodes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/catalog/nodes')>()
  const probe = (y: InputUse, labels: InputUse): NodeDef => ({
    id: `preview-inputs-${y}-${labels}`,
    type: `n4m:fixture.preview.${y}.${labels}`,
    name: 'Preview input requirements',
    category: 'preprocessing',
    description: 'Input requirement fixture',
    params: [],
    native: { methodId: `fixture.preview.${y}.${labels}`, role: 'transformer', inputs: { y, labels, axis: 'none' } },
  })
  return { ...actual, PREPROCESSING_NODES: [
    ...actual.PREPROCESSING_NODES,
    probe('required', 'none'), probe('none', 'required'), probe('required', 'required'),
    probe('optional', 'optional'),
  ] }
})

const fixture = (): MaterializedDataset => ({
  X: new Float64Array([1, 2, 3, 4, 5, 6]), nSamples: 3, nFeatures: 2,
  axis: [0, 1], axisUnit: 'index', y: new Float64Array([1, NaN, 3]),
  targetName: 'target', taskType: 'regression', sampleIds: ['same', 'same', 'other'],
  partitions: ['train', 'test', 'predict'], repetition: 'specimen',
  groupIds: ['a', 'a', 'b'], originIds: ['raw', 'raw', 'external'], repetitionIds: ['same', 'same', 'other'],
  metadata: [{ name: 'batch', kind: 'numeric', values: [1, 1, 2] }],
})

describe('Web Playground projection', () => {
  it('shares Float64 spectral rows and preserves positional units, missing targets and partitions', () => {
    const ds = fixture()
    const result = playgroundDataset(ds, 'Example')
    const rows = result.spectra as readonly Float64Array[]
    expect(rows[1].buffer).toBe(ds.X.buffer)
    expect(rows[1].byteOffset).toBe(ds.X.byteOffset + 2 * Float64Array.BYTES_PER_ELEMENT)
    expect(Array.from(rows[1])).toEqual([3, 4])
    expect(result.wavelengths).toBe(ds.axis)
    expect(result.unit).toBe('index')
    expect(result.description).toMatch(/positional/)
    expect(result.partition).toBe(ds.partitions)
    expect(result.targets?.[0].values).toEqual([1, null, 3])
    expect(playgroundSelectionIds(ds, [1, 0])).toEqual(['same', 'same'])
  })

  it('uses the sorted class vocabulary and leaves missing labels null', () => {
    const ds = { ...fixture(), taskType: 'multiclass' as const, classes: ['z', '', 'a'], y: new Float64Array([1, NaN, 0]) }
    const target = playgroundDataset(ds, 'Classes').targets![0]
    expect(target.classes).toEqual(['a', 'z'])
    expect(target.values).toEqual(['z', null, 'a'])
  })

  it('retains categorical metadata and declared group/origin/repetition roles', () => {
    const ds = fixture()
    const result = playgroundDataset(ds, 'Roles')
    expect(result.metadata?.every((column) => column.kind === 'categorical')).toBe(true)
    expect(result.metadata?.find((column) => column.key === 'role:group')?.values).toBe(ds.groupIds)
    expect(result.metadata?.find((column) => column.key === 'role:origin')?.values).toBe(ds.originIds)
    expect(result.metadata?.find((column) => column.key === result.groupColumn)?.values).toBe(ds.repetitionIds)
  })

  it('changes revision for immutable configuration edits without hashing or copying X', () => {
    const ds = fixture()
    expect(playgroundDatasetKey(ds)).toBe(playgroundDatasetKey(ds))
    for (const patch of [{ targetName: 'other' }, { taskType: 'binary' as const }, { partitions: ds.partitions.slice() }, { repetition: undefined }]) {
      expect(playgroundDatasetKey({ ...ds, ...patch })).not.toBe(playgroundDatasetKey(ds))
    }
  })

  it('offers native preprocessing only, with no split/filter special actions', () => {
    const ids = PLAYGROUND_OPERATORS.map((op) => op.id)
    expect(ids).toContain('n4m:preprocessing.scatter.snv')
    expect(ids).toContain('n4m:preprocessing.derivatives.savitzky_golay')
    expect(ids).toContain('n4m:fixture.preview.optional.optional')
    expect(ids).not.toContain('n4m:fixture.preview.required.none')
    expect(ids).not.toContain('n4m:fixture.preview.none.required')
    expect(ids).not.toContain('n4m:fixture.preview.required.required')
    expect(PLAYGROUND_OPERATORS.every((op) => op.id.startsWith('n4m:') && op.kind === 'preprocessing' && !op.special)).toBe(true)
  })
})
