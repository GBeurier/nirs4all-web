/** Method IDs of the laboratory's host-owned JavaScript models (see hostModels.ts). */
export const RANDOM_FOREST = 'host.mljs.random_forest_regressor'
export const TFJS_CNN = 'host.tfjs.cnn_regressor'
export const BURN_CNN = 'host.burn.cnn_regressor'
/** Classification heads: class ids 0..k-1 of the dataset's declared vocabulary, with probabilities. */
export const RANDOM_FOREST_CLASSIFIER = 'host.mljs.random_forest_classifier'
export const BURN_CNN_CLASSIFIER = 'host.burn.cnn_classifier'
export const HOST_CLASSIFIERS: ReadonlySet<string> = new Set([RANDOM_FOREST_CLASSIFIER, BURN_CNN_CLASSIFIER])
export const HOST_MODELS: ReadonlySet<string> = new Set([RANDOM_FOREST, TFJS_CNN, BURN_CNN, ...HOST_CLASSIFIERS])
