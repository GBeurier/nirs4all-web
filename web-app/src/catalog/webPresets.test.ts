import { expect, it } from 'vitest'
import { buildWebPresets } from './webPresets'
import { expandGeneratorVariants } from '@/engine/dagml'

it('preserves Cartesian multi-step alternatives as complete subchains', () => {
  const snv = 'nirs4all.operators.transforms.scalers.StandardNormalVariate'
  const msc = 'nirs4all.operators.transforms.nirs.MultiplicativeScatterCorrection'
  const sg = 'nirs4all.operators.transforms.nirs.SavitzkyGolay'
  const presets = buildWebPresets('test', 'Subchains', '', 'regression', [
    { _cartesian_: [{ _or_: [[snv, sg], msc] }, { _or_: [null, snv] }] },
    { model: 'sklearn.cross_decomposition._pls.PLSRegression' },
  ])
  const variants = expandGeneratorVariants(presets[0].pipeline)
  expect(variants.map((v) => v.dsl.steps.map((s) => s.type))).toEqual([
    ['n4m:preprocessing.scatter.snv', 'n4m:preprocessing.derivatives.savitzky_golay'],
    ['n4m:preprocessing.scatter.snv', 'n4m:preprocessing.derivatives.savitzky_golay', 'n4m:preprocessing.scatter.snv'],
    ['n4m:preprocessing.scatter.msc'],
    ['n4m:preprocessing.scatter.msc', 'n4m:preprocessing.scatter.snv'],
  ])
})


it('executes a sampled Cartesian subchain even when count selects one alternative', () => {
  const snv = 'nirs4all.operators.transforms.scalers.StandardNormalVariate'
  const msc = 'nirs4all.operators.transforms.nirs.MultiplicativeScatterCorrection'
  const presets = buildWebPresets('one', 'One subchain', '', 'regression', [
    { _cartesian_: [{ _or_: [[snv, msc], [msc, snv]] }], count: 1 },
    { model: 'sklearn.cross_decomposition._pls.PLSRegression' },
  ])
  const [variant] = expandGeneratorVariants(presets[0].pipeline)
  expect(variant.dsl.steps).toHaveLength(2)
  expect(variant.dsl.containers).toBeUndefined()
})
