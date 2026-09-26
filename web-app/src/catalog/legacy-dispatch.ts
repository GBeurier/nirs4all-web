// The n4m manifest methods the staged libn4m WASM (ABI 2.5) can execute, keyed by
// method id: the legacy dispatcher token the DSL and engine use, and the manifest
// parameters that dispatcher honours, in the positional order it reads them
// (`n_components` travels separately). Only these methods are offered; the n4m
// role API (NativeEstimator / methodClass) replaces this table and runs every
// manifest method once the web stages @nirs4all/methods ABI ≥ 2.13.

export interface LegacyDispatch {
  token: string
  params: readonly string[]
  /** regression model that also classifies via one-hot Y + argmax (verified on the staged WASM) */
  classifiable?: true
}

export const LEGACY_DISPATCH: Record<'preprocessing' | 'model' | 'split', Record<string, LegacyDispatch>> = {
  preprocessing: {
    'preprocessing.scatter.snv': { token: 'StandardNormalVariate', params: [] },
    'preprocessing.scatter.msc': { token: 'MSC', params: [] },
    'preprocessing.derivatives.savitzky_golay': { token: 'SavitzkyGolay', params: ['window_length', 'polyorder', 'deriv'] },
    'preprocessing.derivatives.first_derivative': { token: 'Derivative', params: [] },
    'preprocessing.baselines.detrend': { token: 'Detrend', params: ['polyorder'] },
    'preprocessing.smoothing.gaussian': { token: 'GaussianFilter', params: ['sigma'] },
    'preprocessing.baselines.asls': { token: 'AsLS', params: ['lam', 'p', 'max_iter'] },
    'preprocessing.baselines.airpls': { token: 'AirPLS', params: ['lam', 'max_iter'] },
    'preprocessing.baselines.arpls': { token: 'ArPLS', params: ['lam', 'max_iter'] },
    'preprocessing.baselines.modpoly': { token: 'ModPoly', params: ['polyorder', 'max_iter'] },
    'preprocessing.baselines.imodpoly': { token: 'IModPoly', params: ['polyorder', 'max_iter'] },
    'preprocessing.baselines.snip': { token: 'SNIP', params: ['max_half_window'] },
    'preprocessing.baselines.rolling_ball': { token: 'RollingBall', params: ['half_window', 'smooth_half_window'] },
    'preprocessing.baselines.iasls': { token: 'IAsLS', params: ['lam', 'p', 'polyorder'] },
    'preprocessing.baselines.beads': { token: 'BEADS', params: ['lam_0', 'lam_1', 'lam_2'] },
    'preprocessing.signal_conversion.to_absorbance': { token: 'ToAbsorbance', params: ['is_percent', 'epsilon', 'clip_negative'] },
    'preprocessing.signal_conversion.from_absorbance': { token: 'FromAbsorbance', params: ['is_percent'] },
    'preprocessing.signal_conversion.percent_to_fraction': { token: 'PercentToFraction', params: [] },
    'preprocessing.signal_conversion.fraction_to_percent': { token: 'FractionToPercent', params: [] },
    'preprocessing.signal_conversion.kubelka_munk': { token: 'KubelkaMunk', params: ['is_percent', 'epsilon'] },
    'preprocessing.scatter.robust_snv': { token: 'RobustNormalVariate', params: ['with_center', 'with_scale', 'k'] },
    'preprocessing.scatter.local_snv': { token: 'LocalSNV', params: ['window'] },
    'preprocessing.scatter.area_normalization': { token: 'AreaNormalization', params: ['method'] },
    'preprocessing.derivatives.norris_williams': { token: 'NorrisWilliams', params: ['segment', 'gap', 'derivative_order'] },
    'preprocessing.scaling.log_transform': { token: 'LogTransform', params: [] },
    'preprocessing.wavelets.wavelet_denoise': { token: 'WaveletDenoise', params: ['family', 'mode', 'level'] },
  },
  model: {
    'models.pls.pls_regression': { token: 'PLS', params: ['n_components'] },
    'models.classification.pls_lda': { token: 'PLSDA', params: ['n_components'] },
    'models.pls.pcr': { token: 'PCR', params: ['n_components'], classifiable: true },
    'models.regularized.ridge': { token: 'Ridge', params: ['alpha'], classifiable: true },
    'models.regularized.ridge_pls': { token: 'RidgePLS', params: ['n_components', 'ridge_lambda'], classifiable: true },
    'models.regularized.continuum_regression': { token: 'ContinuumRegression', params: ['n_components', 'tau'], classifiable: true },
    'models.regularized.robust_pls': { token: 'RobustPLS', params: ['n_components', 'huber_k', 'max_irls_iter'] },
    'models.pls.cppls': { token: 'CPPLS', params: ['n_components', 'gamma'], classifiable: true },
    'models.sparse.sparse_simpls': { token: 'SparseSIMPLS', params: ['n_components', 'sparsity_lambda'], classifiable: true },
    'models.sparse.group_sparse_pls': { token: 'GroupSparsePLS', params: ['n_components', 'group_lambda'], classifiable: true },
    'models.sparse.fused_sparse_pls': { token: 'FusedSparsePLS', params: ['n_components', 'l1_lambda', 'fusion_lambda'], classifiable: true },
    'models.ensembles.bagging_pls': { token: 'BaggingPLS', params: ['n_components', 'n_estimators', 'seed'], classifiable: true },
    'models.ensembles.boosting_pls': { token: 'BoostingPLS', params: ['n_components', 'n_estimators', 'learning_rate'], classifiable: true },
    'models.ensembles.random_subspace_pls': { token: 'RandomSubspacePLS', params: ['n_components', 'n_estimators', 'features_per_subspace', 'seed'], classifiable: true },
    'models.multiblock.mir_pls': { token: 'MIRPLS', params: ['n_components'], classifiable: true },
    'models.multiblock.mb_pls': { token: 'MBPLS', params: ['n_components'], classifiable: true },
    'models.specialized.missing_aware_nipals': { token: 'MissingAwareNIPALS', params: ['n_components'], classifiable: true },
    'models.specialized.ecr': { token: 'ECR', params: ['n_components', 'alpha'], classifiable: true },
    'models.multiblock.o2pls': { token: 'O2PLS', params: ['n_predictive', 'n_x_orthogonal', 'n_y_orthogonal'], classifiable: true },
  },
  split: {
    'splitters.kennard_stone': { token: 'KennardStone', params: ['test_size'] },
    'splitters.spxy': { token: 'SPXY', params: ['test_size'] },
    'splitters.kmeans': { token: 'KMeans', params: ['test_size', 'seed', 'max_iter'] },
    'splitters.kbins_stratified': { token: 'KBinsStratified', params: ['test_size', 'seed', 'n_bins', 'strategy'] },
    'splitters.systematic_circular': { token: 'SystematicCircular', params: ['test_size', 'seed'] },
  },
}
