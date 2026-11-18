// In-memory session history of Explain results, one list per fitted model (WeakMap:
// dropped with the model). Results survive leaving and re-entering the Explain step,
// never leave the browser and are not persisted.
import { useCallback, useSyncExternalStore } from 'react'

import type { ExplainResponse, FittedPipeline, ImportanceResponse } from '@/engine/types'

interface EntryBase {
  id: string
  label: string
  createdAt: number
  pinned: boolean
  /** shared settings in a few words (method-independent) */
  settingsLabel: string
  /** identical keys ⇔ identical grouping on identical features (comparable group profiles) */
  groupingKey: string
}
export interface ExplanationEntry extends EntryBase {
  kind: 'explanation'
  response: ExplainResponse
}
export interface ImportanceEntry extends EntryBase {
  kind: 'importance'
  response: ImportanceResponse
}
export type HistoryEntry = ExplanationEntry | ImportanceEntry

type Listener = () => void
interface Store {
  entries: HistoryEntry[]
  listeners: Set<Listener>
}
const stores = new WeakMap<object, Store>()
let seq = 0

function storeOf(model: FittedPipeline): Store {
  let s = stores.get(model)
  if (!s) {
    s = { entries: [], listeners: new Set() }
    stores.set(model, s)
  }
  return s
}

function update(model: FittedPipeline, fn: (entries: HistoryEntry[]) => HistoryEntry[]): void {
  const s = storeOf(model)
  s.entries = fn(s.entries)
  s.listeners.forEach((l) => l())
}

/** Keep at most this many unpinned results per model (the oldest go first). */
export const HISTORY_LIMIT = 24

export function addEntries(model: FittedPipeline, entries: Omit<HistoryEntry, 'id' | 'createdAt' | 'pinned'>[]): string[] {
  const now = Date.now()
  const added = entries.map((e) => ({ ...e, id: `x${++seq}`, createdAt: now, pinned: false }) as HistoryEntry)
  update(model, (cur) => {
    const next = [...added, ...cur]
    const unpinned = next.filter((e) => !e.pinned)
    if (unpinned.length <= HISTORY_LIMIT) return next
    const drop = new Set(unpinned.slice(HISTORY_LIMIT).map((e) => e.id))
    return next.filter((e) => !drop.has(e.id))
  })
  return added.map((e) => e.id)
}

export function useExplainHistory(model: FittedPipeline) {
  const store = storeOf(model)
  const entries = useSyncExternalStore(
    useCallback((l: Listener) => {
      store.listeners.add(l)
      return () => {
        store.listeners.delete(l)
      }
    }, [store]),
    () => store.entries,
  )
  return {
    entries,
    rename: (id: string, label: string) => update(model, (cur) => cur.map((e) => (e.id === id ? { ...e, label } : e))),
    togglePin: (id: string) => update(model, (cur) => cur.map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e))),
    remove: (id: string) => update(model, (cur) => cur.filter((e) => e.id !== id)),
    clear: () => update(model, (cur) => cur.filter((e) => e.pinned)),
  }
}

/** Evaluations per millisecond measured on this model's last explanations, or null. */
export function measuredThroughput(entries: readonly HistoryEntry[]): number | null {
  const timed = entries.flatMap((e) => (e.kind === 'explanation' && e.response.elapsedMs && e.response.evaluations > 0 ? [e.response] : []))
  if (timed.length === 0) return null
  const evals = timed.slice(0, 5).reduce((s, r) => s + r.evaluations, 0)
  const ms = timed.slice(0, 5).reduce((s, r) => s + (r.elapsedMs ?? 0), 0)
  return ms > 0 ? evals / ms : null
}
