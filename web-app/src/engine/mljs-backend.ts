import { createMlJsEstimator, loadMlJs, type MlJsModelName } from 'nirs4all/classic-ml'
import type { Mat } from './algo/linalg'
import { loadLibn4mBackend } from './backends'
import type { ModelBackend } from './orchestrate'

const MODEL_NAMES: Record<string, MlJsModelName> = {
  MlJsRandomForestRegressor: 'RandomForestRegressor',
  MlJsRandomForestClassifier: 'RandomForestClassifier',
  MlJsDecisionTreeRegressor: 'DecisionTreeRegressor',
  MlJsDecisionTreeClassifier: 'DecisionTreeClassifier',
  MlJsKNeighborsClassifier: 'KNeighborsClassifier',
}

export function isMlJsModelType(type: string): boolean {
  return Object.hasOwn(MODEL_NAMES, type)
}

interface StoredMlJsModel {
  provider: 'mljs'
  estimatorName: MlJsModelName
  nFeatures: number
  nTargets: number
  artifact: unknown
}

function matrixRows(matrix: Mat): number[][] {
  return Array.from({ length: matrix.rows }, (_, row) =>
    Array.from(matrix.data.subarray(row * matrix.cols, (row + 1) * matrix.cols)))
}

/** Load ml.js once before DAG-ML starts. Every fold callback remains synchronous. */
export async function loadMlJsBackend(): Promise<ModelBackend> {
  const [ml, n4m] = await Promise.all([loadMlJs(), loadLibn4mBackend()])
  return {
    id: 'mljs-classic',
    preproc: n4m.preproc,
    fit(spec, X, Y) {
      const estimatorName = MODEL_NAMES[spec.type]
      if (!estimatorName) throw new RangeError(`Unsupported ml.js model ${spec.type}.`)
      if (X.rows !== Y.rows) throw new RangeError('Feature and target row counts differ.')
      const classifier = estimatorName.endsWith('Classifier')
      if (Y.cols !== 1 && !classifier) {
        throw new RangeError('This ml.js regressor requires one target column.')
      }
      if (Y.cols < 2 && classifier) {
        throw new RangeError('This ml.js classifier requires at least two classes.')
      }
      const Xrows = matrixRows(X)
      const y = Array.from({ length: Y.rows }, (_, row) => {
        if (Y.cols === 1) return Y.data[row]
        let best = 0
        for (let column = 1; column < Y.cols; column++) {
          if (Y.data[row * Y.cols + column] > Y.data[row * Y.cols + best]) best = column
        }
        return best
      })
      let params: Record<string, number | boolean>
      if (estimatorName.startsWith('RandomForest')) {
        const nEstimators = Number(spec.params.n_estimators ?? 100)
        const seed = Number(spec.params.seed ?? 42)
        if (!Number.isInteger(nEstimators) || nEstimators < 1 || nEstimators > 1000) {
          throw new RangeError('n_estimators must be an integer from 1 to 1000.')
        }
        if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
          throw new RangeError('seed must be a nonnegative 32-bit integer.')
        }
        // DAG-ML computes CV; ml-random-forest OOB can fail on small folds.
        params = { nEstimators, seed, noOOB: true }
      } else if (estimatorName.startsWith('DecisionTree')) {
        const minNumSamples = Number(spec.params.min_samples ?? 3)
        const maxDepth = Number(spec.params.max_depth ?? 20)
        if (!Number.isInteger(minNumSamples) || minNumSamples < 1 || minNumSamples > X.rows) {
          throw new RangeError('min_samples must be an integer from 1 to the fold size.')
        }
        if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 100) {
          throw new RangeError('max_depth must be an integer from 1 to 100.')
        }
        params = { minNumSamples, maxDepth }
      } else {
        const k = Number(spec.params.n_neighbors ?? 5)
        if (!Number.isInteger(k) || k < 1 || k > X.rows) {
          throw new RangeError('n_neighbors must be an integer from 1 to the fold size.')
        }
        params = { k }
      }
      const estimator = createMlJsEstimator({ ml, estimatorName, params })
      estimator.fit(Xrows, y)
      return {
        provider: 'mljs', estimatorName, nFeatures: X.cols, nTargets: Y.cols,
        artifact: estimator.toJSON(),
      } satisfies StoredMlJsModel
    },
    predict(model, X) {
      const stored = model as StoredMlJsModel
      if (stored?.provider !== 'mljs' || !Object.values(MODEL_NAMES).includes(stored.estimatorName)) {
        throw new TypeError('Invalid ml.js model artifact.')
      }
      if (stored.nFeatures !== X.cols) throw new RangeError('Feature count differs from ml.js training.')
      const estimator = createMlJsEstimator({ ml, estimatorName: stored.estimatorName }).load(stored.artifact)
      const labels = estimator.predict(matrixRows(X)) as number[]
      if (labels.length !== X.rows || labels.some((value) => !Number.isFinite(value))) {
        throw new Error('ml.js returned an invalid prediction shape or non-finite values.')
      }
      if (!stored.estimatorName.endsWith('Classifier')) {
        return { data: Float64Array.from(labels), rows: X.rows, cols: 1 }
      }
      const data = new Float64Array(X.rows * stored.nTargets)
      for (let row = 0; row < X.rows; row++) {
        const label = labels[row]
        if (!Number.isInteger(label) || label < 0 || label >= stored.nTargets) {
          throw new RangeError('ml.js predicted a class outside the training vocabulary.')
        }
        data[row * stored.nTargets + label] = 1
      }
      return { data, rows: X.rows, cols: stored.nTargets }
    },
  }
}
