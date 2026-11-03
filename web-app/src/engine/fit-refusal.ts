import { N4mError, Status } from './wasm/methods/types.js'

// Identity stays inside the engine worker; infrastructure/contract errors never
// acquire this marker merely because a whole candidate run rejected.
const refusals = new WeakSet<object>()
export function markFitRefusal<T>(error: T): T {
  if (error !== null && typeof error === 'object') refusals.add(error)
  return error
}
export function isFitRefusal(error: unknown): boolean {
  return error !== null && typeof error === 'object' && refusals.has(error)
}

/** Call only at a native fit boundary, never around planning, replay or export. */
export function identifyNativeFitRefusal(error: unknown, methodId?: string): void {
  const statusRefusal = error instanceof N4mError && [
    Status.ERR_INVALID_ARGUMENT, Status.ERR_SHAPE_MISMATCH,
    Status.ERR_NUMERICAL_FAILURE, Status.ERR_CONVERGENCE_FAILED, Status.ERR_UNSUPPORTED,
  ].includes(error.status)
  const parameterRefusal = methodId !== undefined && error instanceof Error
    && error.message.startsWith(`${methodId}: invalid value for parameter '`)
  if (statusRefusal || parameterRefusal) markFitRefusal(error)
}
