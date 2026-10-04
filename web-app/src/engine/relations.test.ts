import { describe, expect, it, vi } from 'vitest'
import { buildDataset } from '@/data/dataset'
import { datasetRelations } from './relations'
import { buildNativeFolds, nonAugmentedScoreRows, validatePartitionGroups } from './grouped-cv'
import { refitWithDagMl, requireRefitRuntime } from './dagml-refit'
import type { DagMlMod } from './dagml'
import type { ModelBackend } from './orchestrate'

function cohort() {
  return buildDataset([
    { name: 'X_train.csv', text: 'a;b\n1;2\n3;4\n5;6\n7;8' },
    { name: 'y_train.csv', text: 'y\n1.2\n2.4\n3.6\n4.8' },
    { name: 'metadata_train.csv', text: 'sample_id;group_id;repetition_id;origin_id;augmented\nα;001;baseline;;false\nβ;001;followup;;false\nγ;002;baseline;;false\nδ;002;aug;γ;true' },
  ])
}
describe('declared browser relation identities', () => {
  it('keeps textual groups, real repetitions and explicit augmentation origins', () => {
    const ds = cohort()
    expect(ds.sampleIds).toEqual(['α', 'β', 'γ', 'δ'])
    expect(ds.groupIds).toEqual(['001', '001', '002', '002'])
    const records = datasetRelations(ds)
    expect(records[3]).toMatchObject({ origin_id: 's2', augmented: true, metadata: { original_origin_id: 'γ', original_group_id: '002' } })
    expect(records[0].group_id).toBe(records[1].group_id)
    expect(records[0].repetition_id).not.toBe(records[1].repetition_id)
  })
  it('never chooses group_id as the sample identity column', () => {
    const ds = buildDataset([{ name: 'X_train.csv', text: 'a;b\n1;2\n3;4' }, { name: 'metadata_train.csv', text: 'group_id\n001\n001' }])
    expect(ds.sampleIds).toEqual(['train-0', 'train-1'])
    expect(ds.groupIds).toEqual(['001', '001'])
  })
  it('leaves undeclared repetitions absent', () => {
    const ds = cohort(); delete ds.repetitionIds
    expect(datasetRelations(ds).every((r) => r.repetition_id === null)).toBe(true)
  })
  it.each(['missing-origin', 'unmarked', 'cross-group', 'misaligned', 'duplicate-id'])('refuses malformed relation %s before native/model calls', (kind) => {
    const ds = cohort()
    if (kind === 'missing-origin') ds.originIds![3] = 'unknown'
    if (kind === 'unmarked') ds.augmented![3] = false
    if (kind === 'cross-group') ds.groupIds![3] = '001'
    if (kind === 'misaligned') ds.groupIds!.pop()
    if (kind === 'duplicate-id') ds.sampleIds[1] = ds.sampleIds[0]
    expect(() => datasetRelations(ds)).toThrow()
  })
  it('refuses a group leaking across an explicit held-out partition', () => {
    const ds = cohort(); ds.partitions[1] = 'test'
    expect(() => validatePartitionGroups(ds)).toThrow(/crosses Train\/Test/)
  })
  it.each(['train', 'test'] as const)('requires a declared group on every %s observation before splitting or fitting', async (partition) => {
    const ds = cohort()
    ds.partitions[0] = partition
    ds.groupIds![0] = null
    const split = vi.fn()
    const fit = vi.fn()
    expect(() => buildNativeFolds({ group_kfold_split_json: split } as unknown as DagMlMod,
      ds, { folds: 2, seed: 42 }, [1, 2, 3])).toThrow(/group_id must be nonempty/)
    await expect(refitWithDagMl(ds, { name: 'missing-group', steps: [], model: { id: 'm', type: 'pls', params: {} } },
      { id: 'unreachable', fit } as unknown as ModelBackend,
      partition === 'test' ? [1, 2, 3] : [0, 1, 2, 3], partition === 'test' ? [0] : [1]))
      .rejects.toThrow(/group_id must be nonempty/)
    expect(split).not.toHaveBeenCalled()
    expect(fit).not.toHaveBeenCalled()
  })
  it('does not require a training group for a prediction-only observation', () => {
    const ds = cohort()
    ds.partitions[0] = 'predict'
    ds.groupIds![0] = null
    expect(() => validatePartitionGroups(ds)).not.toThrow()
  })
  it('excludes augmentations from scoring without changing the selected training rows', () => {
    const ds = cohort()
    const selected = [3, 2, 0, 1]
    expect(nonAugmentedScoreRows(ds, selected)).toEqual([2, 0, 1])
    expect(selected).toEqual([3, 2, 0, 1])
    expect(() => nonAugmentedScoreRows(ds, [3])).toThrow(/non-augmented/)
  })
  it.each(['child-in-test', 'origin-in-test', 'ancestor-in-predict'])('refuses origin leakage without group IDs: %s', (kind) => {
    const ds = cohort()
    delete ds.groupIds
    if (kind === 'child-in-test') ds.partitions[3] = 'test'
    if (kind === 'origin-in-test') ds.partitions[2] = 'test'
    if (kind === 'ancestor-in-predict') {
      ds.partitions[2] = 'predict'
      ds.partitions[1] = 'test'
      ds.originIds![1] = ds.sampleIds[2]
      ds.augmented![1] = true
    }
    expect(() => validatePartitionGroups(ds)).toThrow(/augmentation origin crosses Train\/Test/)
  })
  it('keeps an origin family together without requiring unrelated rows to share its partition', () => {
    const ds = cohort()
    delete ds.groupIds
    ds.partitions[0] = 'test'
    expect(() => validatePartitionGroups(ds)).not.toThrow()
  })
  it('refuses the no-CV origin holdout before REFIT can fit a browser model', async () => {
    const ds = cohort()
    delete ds.groupIds
    ds.partitions[2] = 'test'
    const fit = vi.fn()
    const backend = { id: 'unreachable', fit } as unknown as ModelBackend
    await expect(refitWithDagMl(ds, { name: 'origin-leak', steps: [], model: { id: 'm', type: 'pls', params: {} } },
      backend, [0, 1, 3], [2])).rejects.toThrow(/augmentation origin crosses Train\/Test/)
    expect(fit).not.toHaveBeenCalled()
  })
  it('routes grouped CV to the native API with complete groups and requested folds', () => {
    const native = vi.fn(() => JSON.stringify({ id: 'outer', sample_ids: [], folds: [], sample_groups: {} }))
    const ds = cohort()
    buildNativeFolds({ group_kfold_split_json: native } as unknown as DagMlMod, ds, { folds: 3, seed: 42 }, [0, 1, 2, 3])
    expect(native).toHaveBeenCalledWith('{"n_splits":3}', JSON.stringify({ s0: 'g0', s1: 'g0', s2: 'g1', s3: 'g1' }), 'outer')
  })
  it('does not fallback to row KFold when groups or the native export are missing', () => {
    const rowSplit = vi.fn()
    const ds = cohort()
    expect(() => buildNativeFolds({ kfold_split_json: rowSplit } as unknown as DagMlMod, ds, { folds: 2, seed: 0 }, [0, 1, 2, 3])).toThrow(/GroupKFold/)
    expect(rowSplit).not.toHaveBeenCalled()
    delete ds.groupIds
    expect(() => buildNativeFolds({} as DagMlMod, ds, { folds: 2, seed: 0, strategy: 'sample' }, [0, 1, 2, 3])).toThrow(/origin-safe groups/)
  })
  it('requires actual native REFIT/replay exports rather than a compilation badge', () => {
    expect(() => requireRefitRuntime({ compile_pipeline_dsl_artifact_json: vi.fn() } as unknown as DagMlMod)).toThrow(/No direct-fit fallback/)
  })
})
