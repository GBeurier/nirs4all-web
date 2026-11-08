/**
 * Product-level execution policy for the browser runtime.
 *
 * `strict-wasm` is the deployed Web profile: computation must remain on the
 * staged native/WASM route and every compatibility degrade fails closed.
 * `transitional` keeps the explicit development compatibility path. The offline
 * single-file build is also `strict-wasm` (same owner DAG-ML route in an inline worker).
 */
export const WEB_RUNTIME_PROFILES = ['strict-wasm', 'transitional'] as const
export type WebRuntimeProfile = (typeof WEB_RUNTIME_PROFILES)[number]

export interface WebRuntimePolicy {
  readonly profile: WebRuntimeProfile
  readonly nativeWasmRequired: boolean
  readonly jsBackendFallback: 'forbid' | 'allow-explicit-offline'
  readonly providerMatrixFallback: 'forbid' | 'allow-diagnosed'
  readonly schedulerFallback: 'forbid' | 'allow-explicit'
  readonly remoteComputeProvider: 'forbid'
}

const STRICT_POLICY: WebRuntimePolicy = Object.freeze({
  profile: 'strict-wasm',
  nativeWasmRequired: true,
  jsBackendFallback: 'forbid',
  providerMatrixFallback: 'forbid',
  schedulerFallback: 'forbid',
  remoteComputeProvider: 'forbid',
})

const TRANSITIONAL_POLICY: WebRuntimePolicy = Object.freeze({
  profile: 'transitional',
  nativeWasmRequired: false,
  jsBackendFallback: 'allow-explicit-offline',
  providerMatrixFallback: 'allow-diagnosed',
  schedulerFallback: 'allow-explicit',
  remoteComputeProvider: 'forbid',
})

export function webRuntimePolicy(profile: WebRuntimeProfile): WebRuntimePolicy {
  return profile === 'strict-wasm' ? STRICT_POLICY : TRANSITIONAL_POLICY
}

/** The profile a Vite build mode freezes into its bundles: production, strict and the offline
 *  single-file build are the strict product; development and test stay transitional. */
export function runtimeProfileForBuildMode(mode: string): WebRuntimeProfile {
  return mode === 'production' || mode === 'strict' || mode === 'singlefile' ? 'strict-wasm' : 'transitional'
}

/** Build-selected profile, injected by Vite and frozen into workers as well. */
export function buildWebRuntimeProfile(): WebRuntimeProfile {
  return typeof __N4A_WEB_RUNTIME_PROFILE__ !== 'undefined'
    && __N4A_WEB_RUNTIME_PROFILE__ === 'strict-wasm'
    ? 'strict-wasm'
    : 'transitional'
}
