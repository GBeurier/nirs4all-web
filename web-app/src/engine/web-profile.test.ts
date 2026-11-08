import { describe, expect, it } from 'vitest'
import { buildWebRuntimeProfile, runtimeProfileForBuildMode, WEB_RUNTIME_PROFILES, webRuntimePolicy } from './web-profile'

describe('WEB-001 browser product profiles', () => {
  it('freezes the strict product gate to native/WASM and fail-closed fallbacks', () => {
    expect(WEB_RUNTIME_PROFILES).toEqual(['strict-wasm', 'transitional'])
    expect(webRuntimePolicy('strict-wasm')).toEqual({
      profile: 'strict-wasm',
      nativeWasmRequired: true,
      jsBackendFallback: 'forbid',
      providerMatrixFallback: 'forbid',
      schedulerFallback: 'forbid',
      remoteComputeProvider: 'forbid',
    })
    expect(Object.isFrozen(webRuntimePolicy('strict-wasm'))).toBe(true)
  })

  it('keeps an explicit transitional policy for development builds', () => {
    expect(buildWebRuntimeProfile()).toBe('transitional') // Vitest runs in `test` mode.
    expect(webRuntimePolicy('transitional')).toEqual({
      profile: 'transitional',
      nativeWasmRequired: false,
      jsBackendFallback: 'allow-explicit-offline',
      providerMatrixFallback: 'allow-diagnosed',
      schedulerFallback: 'allow-explicit',
      remoteComputeProvider: 'forbid',
    })
  })

  it('freezes served and single-file builds as strict-wasm; only development and test stay transitional', () => {
    for (const mode of ['production', 'strict', 'singlefile']) expect(runtimeProfileForBuildMode(mode)).toBe('strict-wasm')
    for (const mode of ['development', 'test', 'transitional']) expect(runtimeProfileForBuildMode(mode)).toBe('transitional')
  })
})
