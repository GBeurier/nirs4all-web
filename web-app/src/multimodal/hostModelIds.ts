/** Method IDs of the laboratory's host-owned JavaScript models (see hostModels.ts). */
export const RANDOM_FOREST = 'host.mljs.random_forest_regressor'
export const TFJS_CNN = 'host.tfjs.cnn_regressor'
export const BURN_CNN = 'host.burn.cnn_regressor'
export const HOST_MODELS: ReadonlySet<string> = new Set([RANDOM_FOREST, TFJS_CNN, BURN_CNN])
