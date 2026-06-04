import type { MaterializedDataset } from '@/engine/types'
import { buildDataset, encodeTarget, type RawFile } from './dataset'
// Bundled at build time (?raw) so samples work offline, including the inlined
// single-file build under file:// — no fetch, no separate assets.
import xTrain from './sample/X_train.csv?raw'
import yTrain from './sample/y_train.csv?raw'
import metaTrain from './sample/metadata_train.csv?raw'
import xTest from './sample/X_test.csv?raw'
import yTest from './sample/y_test.csv?raw'
import metaTest from './sample/metadata_test.csv?raw'
import nirXTrain from './sample-nir/X_train.csv?raw'
import nirYTrain from './sample-nir/y_train.csv?raw'
import nirXTest from './sample-nir/X_test.csv?raw'
import nirYTest from './sample-nir/y_test.csv?raw'

export type SampleId = 'fruit' | 'nir-reg' | 'nir-clf'
export interface SampleInfo {
  id: SampleId
  name: string
  task: 'regression' | 'classification'
  hint: string
}
export const SAMPLES: SampleInfo[] = [
  { id: 'fruit', name: 'Fruit purée', task: 'regression', hint: 'tiny · protein' },
  { id: 'nir-reg', name: 'NIR protein', task: 'regression', hint: '210 spectra · regression' },
  { id: 'nir-clf', name: 'NIR protein', task: 'classification', hint: '210 spectra · 7 classes' },
]

const fruitFiles: RawFile[] = [
  { name: 'X_train.csv', text: xTrain },
  { name: 'y_train.csv', text: yTrain },
  { name: 'metadata_train.csv', text: metaTrain },
  { name: 'X_test.csv', text: xTest },
  { name: 'y_test.csv', text: yTest },
  { name: 'metadata_test.csv', text: metaTest },
]
const nirFiles: RawFile[] = [
  { name: 'X_train.csv', text: nirXTrain },
  { name: 'y_train.csv', text: nirYTrain },
  { name: 'X_test.csv', text: nirXTest },
  { name: 'y_test.csv', text: nirYTest },
]

export async function loadSampleDataset(id: SampleId = 'fruit'): Promise<MaterializedDataset> {
  if (id === 'fruit') {
    const ds = buildDataset(fruitFiles, 'Fruit purée (protein)')
    ds.targetName = 'protein'
    return ds
  }
  // NIR protein: the same real spectra, modelled either as regression (predict the
  // protein value) or classification (predict the protein class).
  const ds = buildDataset(nirFiles, id === 'nir-clf' ? 'NIR protein class' : 'NIR protein')
  ds.targetName = 'protein'
  const task = id === 'nir-clf' ? 'multiclass' : 'regression'
  if (task !== ds.taskType) {
    ds.taskType = task
    const enc = encodeTarget(ds.yRaw ?? ds.y, ds.labelsRaw ?? Array.from(ds.y, String), task)
    ds.y = enc.y
    ds.classes = enc.classes
  }
  return ds
}
