import type { MaterializedDataset } from '@/engine/types'
import { buildDataset, type RawFile } from './dataset'

// The bundled demo datasets (real NIRS/FTIR corpora — see ./demo/SOURCES.md for
// provenance + licences). Each is shipped as-is with its own train/test split.
// The CSVs are loaded with a per-dataset dynamic import() so they CODE-SPLIT:
// only the picked dataset's spectra download (anopheles alone is ~6.8 MB), and
// they still inline into the offline single-file build.
export type SampleId = 'corn' | 'beer' | 'meat' | 'anopheles'
export interface SampleInfo {
  id: SampleId
  name: string
  task: 'regression' | 'classification'
  hint: string
}
export const SAMPLES: SampleInfo[] = [
  { id: 'corn', name: 'Corn protein', task: 'regression', hint: '80 NIR spectra · protein' },
  { id: 'beer', name: 'Beer extract', task: 'regression', hint: '60 NIR spectra · original extract' },
  { id: 'meat', name: 'Meat species', task: 'classification', hint: '120 FTIR spectra · 3 classes' },
  { id: 'anopheles', name: 'Anopheles oocyst', task: 'classification', hint: '333 NIR spectra · 2 classes' },
]

interface DemoMeta {
  /** display name passed to buildDataset */
  name: string
  /** human target label (overrides the raw Y header) */
  targetName: string
  /** lazy loader → the four RawFiles buildDataset consumes (X/Y train+test) */
  load: () => Promise<RawFile[]>
}

const DEMOS: Record<SampleId, DemoMeta> = {
  corn: {
    name: 'Corn protein (NIR)',
    targetName: 'protein',
    load: async () => [
      { name: 'Xtrain.csv', text: (await import('./demo/corn/Xtrain.csv?raw')).default },
      { name: 'Ytrain.csv', text: (await import('./demo/corn/Ytrain.csv?raw')).default },
      { name: 'Xtest.csv', text: (await import('./demo/corn/Xtest.csv?raw')).default },
      { name: 'Ytest.csv', text: (await import('./demo/corn/Ytest.csv?raw')).default },
    ],
  },
  beer: {
    name: 'Beer extract (NIR)',
    targetName: 'original_extract',
    load: async () => [
      { name: 'Xtrain.csv', text: (await import('./demo/beer/Xtrain.csv?raw')).default },
      { name: 'Ytrain.csv', text: (await import('./demo/beer/Ytrain.csv?raw')).default },
      { name: 'Xtest.csv', text: (await import('./demo/beer/Xtest.csv?raw')).default },
      { name: 'Ytest.csv', text: (await import('./demo/beer/Ytest.csv?raw')).default },
    ],
  },
  meat: {
    name: 'Meat species (FTIR)',
    targetName: 'meat_species',
    load: async () => [
      { name: 'Xtrain.csv', text: (await import('./demo/meat/Xtrain.csv?raw')).default },
      { name: 'Ytrain.csv', text: (await import('./demo/meat/Ytrain.csv?raw')).default },
      { name: 'Xtest.csv', text: (await import('./demo/meat/Xtest.csv?raw')).default },
      { name: 'Ytest.csv', text: (await import('./demo/meat/Ytest.csv?raw')).default },
    ],
  },
  anopheles: {
    name: 'Anopheles oocyst (NIR)',
    targetName: 'oocyst',
    load: async () => [
      { name: 'Xtrain.csv', text: (await import('./demo/anopheles/Xtrain.csv?raw')).default },
      { name: 'Ytrain.csv', text: (await import('./demo/anopheles/Ytrain.csv?raw')).default },
      { name: 'Xtest.csv', text: (await import('./demo/anopheles/Xtest.csv?raw')).default },
      { name: 'Ytest.csv', text: (await import('./demo/anopheles/Ytest.csv?raw')).default },
    ],
  },
}

export async function loadSampleDataset(id: SampleId = 'corn'): Promise<MaterializedDataset> {
  const meta = DEMOS[id]
  // task type (regression vs binary/multiclass) is inferred from the integer-vs-float
  // targets by buildDataset → inferTaskType, which is correct for all four corpora.
  const ds = buildDataset(await meta.load(), meta.name)
  ds.targetName = meta.targetName
  return ds
}
