// Session persistence — survive a page reload without losing work. The user's
// edited pipeline, an imported .n4a model, and the active bundled sample are
// kept in localStorage so relaunching restores the session. This is pure
// frontend UI state (reproducibility/lineage live in dag-ml); large uploaded
// matrices are intentionally NOT persisted (localStorage is small) — only the
// bundled-sample id is, so demo sessions restore in full and uploads are
// re-dropped. Typed arrays in the fitted model round-trip via the n4a codec.
import type { SampleId } from '@/data/samples'
import type { PipelineDSL } from '@/engine/types'
import { deserializeTyped, type LoadedModel, serializeTyped } from './n4a'

const KEY = 'nirs4all-lite:session:v1'

export interface Session {
  pipeline?: PipelineDSL
  model?: LoadedModel | null
  sampleId?: SampleId | null
}

/** Restore the persisted session (empty object if none / unavailable / corrupt). */
export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const s = deserializeTyped<Session>(raw)
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {} // private mode / quota / corrupt JSON — start fresh, never throw
  }
}

/** Persist the session. Best-effort: storage errors (quota, disabled) are ignored. */
export function saveSession(s: Session): void {
  try {
    localStorage.setItem(KEY, serializeTyped(s))
  } catch {
    /* non-fatal */
  }
}

/** Forget the persisted session (the "start over" affordance). */
export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* non-fatal */
  }
}
