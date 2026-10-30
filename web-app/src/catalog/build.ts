import type { PipelineDSL, TaskType } from '@/engine/types'
import { defaultParams, modelsForTask } from './nodes'

let uid = 0
const sid = () => `step-${(uid++).toString(36)}`

/** An editable initial canvas, separate from the authoritative Studio preset catalogue. */
export function defaultPipeline(taskType: TaskType): PipelineDSL {
  const regression = taskType === 'regression'
  const modelType = regression ? 'n4m:models.pls.pls_regression' : 'n4m:models.classification.pls_lda'
  const dsl: PipelineDSL = {
    name: 'Untitled pipeline',
    steps: regression ? [] : [
      { id: sid(), type: 'n4m:preprocessing.scatter.snv', params: defaultParams('n4m:preprocessing.scatter.snv') },
      { id: sid(), type: 'n4m:preprocessing.derivatives.savitzky_golay',
        params: { ...defaultParams('n4m:preprocessing.derivatives.savitzky_golay'), window_length: 17, polyorder: 2, deriv: 2 } },
    ],
    model: { id: sid(), type: modelType, params: { ...defaultParams(modelType), n_components: regression ? 12 : 8 } },
    cv: { folds: 5, seed: 42 },
  }
  const models = modelsForTask(taskType)
  if (dsl.model && !models.some((model) => model.type === dsl.model!.type) && models.length) {
    dsl.model = { id: sid(), type: models[0].type, params: defaultParams(models[0].type) }
  }
  return dsl
}
