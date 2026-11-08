import { describe, expect, it } from 'vitest'
import { loadSampleDataset, loadSampleDatasetOracle, SAMPLES } from './samples'
import { ioRetainedOf, mapAssembledToMaterialized, type AssembledFull } from './wasm-io'
import { loadDataIoWasm } from '@/engine/nirs4all-core'

// Parity gate for retiring the local CSV builder: the bundled samples assembled by
// nirs4all-io (active path) must equal the former local builder's output (test oracle)
// within each declared partition: IO retains its own partition order. These four
// id-free demos explicitly use positional identity, so only their original row
// positions WITHIN the same partition align the two views. Neither row label is
// a semantic sample/observation ID. The original oracle and input bytes stay intact.
const sameRowBits = (a: Float64Array, ar: number, b: Float64Array, br: number, width: number) => {
  const left = new Uint8Array(a.buffer, a.byteOffset + ar * width * 8, width * 8)
  const right = new Uint8Array(b.buffer, b.byteOffset + br * width * 8, width * 8)
  return left.every((byte, i) => byte === right[i])
}
const missing = (a: ArrayLike<number>) => Array.from(a).filter(Number.isNaN).length

describe.each(SAMPLES.map((s) => s.id))('io vs local-builder oracle parity: %s', (id) => {
  it('assembles identical X bits, targets, partitions, axis and task', async () => {
    const [io, oracle] = await Promise.all([loadSampleDataset(id), loadSampleDatasetOracle(id)])
    expect([io.nSamples, io.nFeatures]).toEqual([oracle.nSamples, oracle.nFeatures])
    expect(missing(io.X)).toBe(missing(oracle.X))
    const retained = ioRetainedOf(io)!
    expect(retained.record.partition_order).toEqual(['test', 'train'])
    expect(io.partitionNames).toEqual(retained.record.partition_order!.flatMap((p) => Array(retained.record.blocks[p].x[0].n_rows).fill(p)))
    expect(retained.record.n_sources).toBe(2)
    expect(Object.values(retained.record.blocks).every((b) => b.x.length === 1)).toBe(true)
    expect(io.identity).toMatchObject({ basis: 'positional' })
    expect(retained.record.identity?.provenance?.sample_id).toBeNull()
    expect(io.sampleIdColumn).toBeUndefined()
    expect(io.observationIds).toBeUndefined()
    expect([...new Set(io.partitions)].sort()).toEqual([...new Set(oracle.partitions)].sort())
    for (const partition of new Set(io.partitions)) {
      const ioRows = io.partitions.flatMap((p, i) => p === partition ? [i] : [])
      const oracleRows = oracle.partitions.flatMap((p, i) => p === partition ? [i] : [])
      expect(ioRows.length).toBe(oracleRows.length)
      for (let row = 0; row < ioRows.length; row++) {
        const i = ioRows[row], j = oracleRows[row]
        expect(sameRowBits(io.X, i, oracle.X, j, io.nFeatures)).toBe(true)
        expect(sameRowBits(io.yRaw!, i, oracle.yRaw!, j, 1)).toBe(true)
        expect(Object.is(io.y[i], oracle.y[j])).toBe(true)
        expect(io.labelsRaw?.[i]).toBe(oracle.labelsRaw?.[j])
        expect(io.classes?.[i]).toBe(oracle.classes?.[j])
        expect(io.sampleIds[i]).toBe(`${partition}#${row}`)
        expect(oracle.sampleIds[j]).toBe(`${partition}-${row}`)
      }
    }
    expect(io.axis).toEqual(oracle.axis)
    expect(io.axisUnit).toBe(oracle.axisUnit)
    expect(io.taskType).toBe(oracle.taskType)
    expect(io.targetName).toBe(oracle.targetName)
    expect(missing(io.yRaw!)).toBe(missing(oracle.yRaw!))
    expect(io.sampleIds).toHaveLength(oracle.sampleIds.length)
    if (id === 'corn') {
      // A genuine second X source in the SAME partition still needs source
      // selection. Assemble the original corn bytes through IO, not a fake DTO.
      const { io: nativeIo } = await loadDataIoWasm()
      const source = retained.spec.sources!.find((s) => s.role === 'features' && s.partition === 'train')!
      const original = retained.inputs.find((f) => f.name === source.input)!
      const second = { name: 'Xtrain_second.csv', bytes: original.bytes }
      const multi: AssembledFull = nativeIo.assembleDataset([...retained.inputs, second], [], JSON.stringify({
        ...retained.spec, sources: [...retained.spec.sources!, { ...source, id: 'train_x_second', input: second.name }],
      }))
      expect(multi.blocks.train.x).toHaveLength(2)
      expect(multi.blocks.test.x).toHaveLength(1)
      expect(() => mapAssembledToMaterialized(multi)).toThrow(/2 feature sources in partition "train"/)
    }
  })
})
