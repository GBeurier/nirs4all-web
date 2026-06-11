// Session persistence — survive a page reload without losing work. The user's
// edited pipeline, an imported .n4a model, and the active bundled sample are
// kept in localStorage so relaunching restores the session. This is pure
// frontend UI state (reproducibility/lineage live in dag-ml); large uploaded
// matrices are intentionally NOT persisted (localStorage is small) — only the
// bundled-sample id is, so demo sessions restore in full and uploads are
// re-dropped. Typed arrays in the fitted model round-trip via the n4a codec.
import { nodeByType } from '@/catalog/nodes'
import type { SampleId } from '@/data/samples'
import type { PipelineDSL } from '@/engine/types'
import { deserializeTyped, type LoadedModel, serializeTyped } from './n4a'

const KEY = 'nirs4all-web:session:v1'
const LEGACY_SESSION_KEYS = ['nirs4all-lite:session:v1']
const SAMPLE_IDS: SampleId[] = ['fruit', 'nir-reg', 'nir-clf']

export interface Session {
  pipeline?: PipelineDSL
  model?: LoadedModel | null
  sampleId?: SampleId | null
}

// Restored data is untrusted (manual edits, a catalog that dropped an operator
// between versions, a half-written value): validate shape + catalog membership
// before it reaches the editor/run/predict, else fall back to defaults.
function validPipeline(p: unknown): PipelineDSL | undefined {
  if (!p || typeof p !== 'object') return undefined
  const dsl = p as PipelineDSL
  if (!Array.isArray(dsl.steps)) return undefined
  // cv is OPTIONAL (refit-only run); if present it must be well-formed.
  if (dsl.cv !== undefined && (typeof dsl.cv.folds !== 'number' || typeof dsl.cv.seed !== 'number')) return undefined
  if (!dsl.steps.every((s) => s && typeof s.type === 'string' && nodeByType(s.type))) return undefined
  // containers are OPTIONAL (the recursive DAG tree); if present, validate each
  // against the catalog. branch/concat/merge branches hold preprocessing nodes;
  // generator branches hold preprocessing nodes too (the alternative sub-chains).
  // A malformed container fails the whole restore.
  if (dsl.containers !== undefined) {
    if (!Array.isArray(dsl.containers)) return undefined
    const okContainer = (c: unknown): boolean => {
      if (!c || typeof c !== 'object') return false
      const cn = c as { container?: unknown; branches?: unknown; mode?: unknown }
      if (!['branch', 'concat_transform', 'merge', 'generator'].includes(String(cn.container))) return false
      if (!Array.isArray(cn.branches)) return false
      return cn.branches.every(
        (b) => b && typeof b === 'object' && Array.isArray((b as { steps?: unknown }).steps) &&
          (b as { steps: unknown[] }).steps.every((s) => s && typeof (s as { type?: unknown }).type === 'string' && nodeByType((s as { type: string }).type)?.category === 'preprocessing'),
      )
    }
    if (!dsl.containers.every(okContainer)) return undefined
  }
  // legacy `branch` block (v1) — if present, every branch step must be a known
  // preprocessing node. (Migrated to `containers` at load by migrateLegacyBranch.)
  if (dsl.branch !== undefined) {
    if (!dsl.branch || !Array.isArray(dsl.branch.branches)) return undefined
    const branchesOk = dsl.branch.branches.every(
      (b) => b && Array.isArray(b.steps) && b.steps.every((s) => s && typeof s.type === 'string' && nodeByType(s.type)?.category === 'preprocessing'),
    )
    if (!branchesOk) return undefined
  }
  // model is OPTIONAL (preprocessing-only pipelines persist too); but if present
  // it must be a known catalog model. A malformed/unknown model is dropped to
  // undefined rather than failing the whole restore.
  if (dsl.model !== undefined) {
    if (typeof dsl.model.type !== 'string' || !nodeByType(dsl.model.type)) return undefined
  }
  // split is OPTIONAL; if present it must be a known split-category catalog node.
  if (dsl.split !== undefined) {
    if (typeof dsl.split.type !== 'string') return undefined
    const sdef = nodeByType(dsl.split.type)
    if (!sdef || sdef.category !== 'split') return undefined
  }
  return dsl
}
function validModel(m: unknown): LoadedModel | undefined {
  if (!m || typeof m !== 'object') return undefined
  const lm = m as LoadedModel
  const fp = lm.model
  if (!fp || typeof fp !== 'object' || !fp.dsl || !fp.state || typeof fp.nFeatures !== 'number') return undefined
  return lm
}
const validSampleId = (s: unknown): SampleId | undefined => (typeof s === 'string' && (SAMPLE_IDS as string[]).includes(s) ? (s as SampleId) : undefined)

/** Restore the persisted session, validated against the catalog (empty object if
 *  none / unavailable / corrupt / stale). Invalid parts are dropped, not thrown. */
export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(KEY) ?? LEGACY_SESSION_KEYS.map((k) => localStorage.getItem(k)).find(Boolean)
    if (!raw) return {}
    const s = deserializeTyped<Session>(raw)
    if (!s || typeof s !== 'object') return {}
    return { pipeline: validPipeline(s.pipeline), model: validModel(s.model), sampleId: validSampleId(s.sampleId) }
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

// ── light/dark theme (the studio chrome ships a real dark mode) ──────────────
// Pure frontend UI state: a `dark` class on <html> + a localStorage flag, read
// once on boot so the choice survives reloads. Defaults to light.
const THEME_KEY = 'nirs4all-web:theme:v1'
const LEGACY_THEME_KEYS = ['nirs4all-lite:theme:v1']
export type Theme = 'light' | 'dark'

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY) ?? LEGACY_THEME_KEYS.map((k) => localStorage.getItem(k)).find(Boolean)
    return stored === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Apply the theme (toggle the `.dark` class on <html>) and persist it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* non-fatal */
  }
}
