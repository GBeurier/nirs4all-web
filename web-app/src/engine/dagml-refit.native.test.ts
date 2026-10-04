// Mandatory fresh-WASM witnesses. No skips and no replacement numerical estimator.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initSync as initDagMl } from './wasm/dagml/dag_ml_wasm.js'
import { initSync as initData } from './wasm/dagml-data/dag_ml_data_wasm.js'
import { initSync as initDatasets } from './wasm/datasets/nirs4all_datasets_wasm.js'
import { loadSampleDataset, type SampleId } from '@/data/samples'
import { loadLibn4mBackend } from './backends'
import { DagMlEngine } from './dagml-engine'
import { MainEngine } from './main-engine'
import { loadDagMl } from './dagml'
import { carrierFingerprint, refitWithDagMl, replayWithDagMl, type NativeRefitState } from './dagml-refit'
import { buildNativeFolds } from './grouped-cv'
import { datasetRelations } from './relations'
import { trainRowsOf, testRowsOf } from './partition'
import { exportPipeline, predictPipelineMatrix, type FittedState } from './orchestrate'
import type { PipelineDSL } from './types'

beforeAll(() => {
  initDagMl({ module: readFileSync(new URL('./wasm/dagml/dag_ml_wasm_bg.wasm', import.meta.url)) })
  initData({ module: readFileSync(new URL('./wasm/dagml-data/dag_ml_data_wasm_bg.wasm', import.meta.url)) })
  initDatasets({ module: readFileSync(new URL('./wasm/datasets/nirs4all_datasets_wasm_bg.wasm', import.meta.url)) })
})
const pipeline: PipelineDSL = { name: 'native browser package', steps: [], model: { id: 'm', type: 'n4m:models.regularized.ridge', params: { alpha: 1 } } }
describe('native browser full REFIT and PREDICT', () => {
  it.each<SampleId>(['corn', 'meat'])('fits once on genuine Train and replays/export-imports %s without fitting', async (sample) => {
    const ds = await loadSampleDataset(sample)
    const backend = await loadLibn4mBackend()
    const fit = vi.spyOn(backend, 'fit')
    const train = trainRowsOf(ds), heldout = testRowsOf(ds)
    const { fitted, pred } = await refitWithDagMl(ds, pipeline, backend, train, heldout)
    expect(fit).toHaveBeenCalledTimes(1)
    const state = (fitted.state as FittedState & { nativeRefit: NativeRefitState }).nativeRefit
    const pkg = JSON.parse(state.packageJson)
    expect(pkg.training_sample_ids).toEqual(train.map((i) => `s${i}`))
    expect(pkg.training_relations.records.every((r: { sample_id: string }) => !heldout.some((i) => r.sample_id === `s${i}`))).toBe(true)
    expect(pkg.artifacts).toHaveLength(1)
    expect(pkg.artifacts[0].load_mode).toBe('host_sidecar')
    const canonical = exportPipeline(fitted, true, backend)
    const { nativeRefit: _native, ...canonicalState } = canonical.state as FittedState & { nativeRefit: NativeRefitState }
    const bytes = new TextEncoder().encode(JSON.stringify({ dsl: canonical.dsl, taskType: canonical.taskType,
      nFeatures: canonical.nFeatures, features: canonical.features, classes: canonical.classes, state: canonicalState }))
    expect(pkg.artifacts[0].record.artifact).toMatchObject({ id: state.artifactId,
      content_fingerprint: await carrierFingerprint(fitted, backend), size_bytes: bytes.byteLength })
    expect(state.carrierSha256).toBe(pkg.artifacts[0].record.artifact.content_fingerprint)
    const input = Float64Array.from(heldout.flatMap((i) => Array.from(ds.X.subarray(i * ds.nFeatures, (i + 1) * ds.nFeatures))))
    const replay = await replayWithDagMl(fitted, input, heldout.length, ds.nFeatures, backend, fitted.features?.names)
    expect(Array.from(replay.data)).toEqual(Array.from(pred.data))
    // With >10 rows native IDs sort lexically (s1,s10,s2); public predictions
    // must still match the original input order, including class columns.
    expect(heldout.length).toBeGreaterThan(10)
    const direct = predictPipelineMatrix(fitted, input, heldout.length, ds.nFeatures, backend, fitted.features?.names)
    expect(Array.from(replay.data)).toEqual(Array.from(direct.data))
    expect(fit).toHaveBeenCalledTimes(1)
    const shared = await new DagMlEngine().exportModel(fitted, { allowTrainingRows: false })
    const restored = structuredClone(shared)
    expect((restored.state as { nativeRefit: NativeRefitState }).nativeRefit.packageJson).toBe(state.packageJson)
    const output = await new MainEngine({ profile: 'strict-wasm' }).predict(restored, input, heldout.length, ds.nFeatures, fitted.features?.names)
    expect(output.values).toHaveLength(heldout.length)
    if (sample === 'meat') expect(output.labels?.every((label) => fitted.classes!.includes(label))).toBe(true)
    expect(fit).toHaveBeenCalledTimes(1)
    // Imported carrier mutation is refused before model calls; export cannot reseal it.
    restored.dsl.model!.params.alpha = 9
    await expect(replayWithDagMl(restored, input, heldout.length, ds.nFeatures, backend)).rejects.toThrow(/sidecar/)
    await expect(new DagMlEngine().exportModel(restored, { allowTrainingRows: false })).rejects.toThrow(/modified/)
    fit.mockRestore()
  })
  it('native GroupKFold keeps whole unequal groups disjoint and validates every Train ID once', async () => {
    const ds = await loadSampleDataset('corn')
    const train = trainRowsOf(ds)
    ds.groupIds = ds.partitions.map((partition, i) => `${partition}-group-${Math.floor(i / 3)}`)
    const dagml = await loadDagMl()
    const folds = buildNativeFolds(dagml, ds, { folds: 3, seed: 42 }, train)
    expect(() => dagml.validate_fold_set_json(JSON.stringify(folds))).not.toThrow()
    const overlapping = structuredClone(folds)
    overlapping.folds[0].train_sample_ids.push(overlapping.folds[0].validation_sample_ids[0])
    expect(() => dagml.validate_fold_set_json(JSON.stringify(overlapping))).toThrow()
    const validation = folds.folds.flatMap((f) => f.validation_sample_ids)
    expect([...validation].sort()).toEqual(train.map((i) => `s${i}`).sort())
    for (const fold of folds.folds) {
      const trainGroups = new Set(fold.train_sample_ids.map((id) => folds.sample_groups[id]))
      expect(fold.validation_sample_ids.every((id) => !trainGroups.has(folds.sample_groups[id]))).toBe(true)
    }
  })
  it('refuses a valid foreign learned state even after the local carrier is resealed', async () => {
    const ds = await loadSampleDataset('corn')
    const backend = await loadLibn4mBackend()
    const train = trainRowsOf(ds), heldout = testRowsOf(ds)
    const original = await refitWithDagMl(ds, pipeline, backend, train, heldout)
    const other = { ...ds, y: Float64Array.from(ds.y) }
    for (const i of train) other.y[i] = 3 * ds.y[i] + 17
    const donor = await refitWithDagMl(other, pipeline, backend, train, heldout)
    expect(Array.from(donor.pred.data)).not.toEqual(Array.from(original.pred.data))
    const transplanted = structuredClone(await new DagMlEngine().exportModel(original.fitted, { allowTrainingRows: false }))
    const target = transplanted.state as FittedState & { nativeRefit: NativeRefitState }
    target.model = structuredClone((donor.fitted.state as FittedState).model)
    // The replacement is genuine, independently fitted N4ME, not damaged bytes.
    const input = Float64Array.from(heldout.flatMap((i) => Array.from(ds.X.subarray(i * ds.nFeatures, (i + 1) * ds.nFeatures))))
    expect(Array.from(backend.predict(target.model, { data: input, rows: heldout.length, cols: ds.nFeatures }).data))
      .toEqual(Array.from(donor.pred.data))
    const originalPackage = target.nativeRefit.packageJson
    const dagml = await loadDagMl()
    expect(() => dagml.validate_initial_full_refit_package_json(originalPackage)).not.toThrow()
    target.nativeRefit.carrierSha256 = await carrierFingerprint(transplanted, backend)
    const reference = JSON.parse(originalPackage).artifacts[0].record.artifact
    expect(target.nativeRefit.carrierSha256).not.toBe(reference.content_fingerprint)
    const predict = vi.spyOn(backend, 'predict')
    try {
      await expect(replayWithDagMl(transplanted, input, heldout.length, ds.nFeatures, backend)).rejects.toThrow(/sidecar differs/)
      expect(predict).not.toHaveBeenCalled()
      await expect(new DagMlEngine().exportModel(transplanted, { allowTrainingRows: false })).rejects.toThrow(/modified/)
      expect(target.nativeRefit.packageJson).toBe(originalPackage)
    } finally {
      predict.mockRestore()
    }
  })
  it('keeps native grouped training scopes while excluding augmentations from real OOF and held-out scoring', async () => {
    const ds = await loadSampleDataset('corn')
    const train = trainRowsOf(ds), heldout = testRowsOf(ds)
    ds.groupIds = ds.partitions.map((partition, i) => `${partition}-group-${Math.floor(i / 3)}`)
    ds.originIds = ds.sampleIds.map(() => null)
    ds.augmented = ds.sampleIds.map(() => false)
    const child = train[1], origin = train[0], testChild = heldout[1], testOrigin = heldout[0]
    for (const [augmented, parent] of [[child, origin], [testChild, testOrigin]]) {
      ds.groupIds[augmented] = ds.groupIds[parent]
      ds.originIds[augmented] = ds.sampleIds[parent]
      ds.augmented[augmented] = true
    }
    const dagml = await loadDagMl()
    const relations = datasetRelations(ds)
    const groups = Object.fromEntries(train.map((i) => [`s${i}`, relations[i].group_id]))
    const native = JSON.parse(dagml.group_kfold_split_json('{"n_splits":3}', JSON.stringify(groups), 'outer'))
    const folds = buildNativeFolds(dagml, ds, { folds: 3, seed: 42 }, train)
    expect(folds.partition_mode).toBe('resampled')
    expect(() => dagml.validate_fold_set_json(JSON.stringify(folds))).not.toThrow()
    const wronglyPartitioned = structuredClone(folds)
    delete wronglyPartitioned.partition_mode
    expect(() => dagml.validate_fold_set_json(JSON.stringify(wronglyPartitioned))).toThrow()
    for (let i = 0; i < folds.folds.length; i++) {
      expect(folds.folds[i].train_sample_ids).toEqual(native.folds[i].train_sample_ids)
      expect(folds.folds[i].validation_sample_ids).toEqual(native.folds[i].validation_sample_ids.filter((id: string) => id !== `s${child}`))
    }
    expect(folds.folds.some((fold) => fold.train_sample_ids.includes(`s${child}`))).toBe(true)
    const validation = folds.folds.flatMap((fold) => fold.validation_sample_ids)
    expect([...validation].sort()).toEqual(train.filter((i) => i !== child).map((i) => `s${i}`).sort())
    const result = await new MainEngine({ profile: 'strict-wasm' }).run(ds, { ...pipeline, cv: { folds: 3, seed: 42 } })
    expect(result.lineage).toMatchObject({ executed: true, refitExecuted: true })
    expect(result.diagnostics ?? []).toEqual([])
    expect(result.cv!.predictions.map((row) => row.sampleId).sort()).toEqual(train.filter((i) => i !== child).map((i) => ds.sampleIds[i]).sort())
    expect(result.folds.flatMap((fold) => fold.predictions.map((row) => row.sampleId)).sort()).toEqual(result.cv!.predictions.map((row) => row.sampleId).sort())
    expect(result.refit.predictions.map((row) => row.sampleId).sort()).toEqual(heldout.filter((i) => i !== testChild).map((i) => ds.sampleIds[i]).sort())
    const pkg = JSON.parse((result.model.state as FittedState & { nativeRefit: NativeRefitState }).nativeRefit.packageJson)
    expect(pkg.training_sample_ids).toEqual(train.map((i) => `s${i}`))
    const noCv = await new MainEngine({ profile: 'strict-wasm' }).run(ds, pipeline)
    expect(noCv.cv).toBeUndefined()
    expect(noCv.folds).toEqual([])
    expect(noCv.refit.predictions.map((row) => row.sampleId).sort()).toEqual(result.refit.predictions.map((row) => row.sampleId).sort())
  })
})
