import raw from './evidence.json'
import type { LevelKind } from './diagrams'

/** Native results recorded from the laboratory; the slides only format them. */
export type CaseId = 'spectroscopy' | 'genetics' | 'images'
export interface EvidenceRun {
  name: string
  level: LevelKind
  oofRmse: number
  oofR2: number | null
  testRmse: number
  foldsFingerprint: string
  recipeFingerprint: string
  edit?: string
  pipeline: unknown[]
}
export interface EvidenceCase {
  dataset: { name: string; samples: number; target: { name: string; unit: string }; sources: Array<{ id: string; label: string; shape: number[] }> }
  ownerVersions: Record<string, string>
  calibration: number
  holdout: number
  foldsFingerprint: string
  presets: EvidenceRun[]
  edits: EvidenceRun[]
}
type Recorded = { capturedAt: string; source: { web: string; ui: string }; cases: Record<CaseId, EvidenceCase> }

/**
 * Display names (French) and fusion levels for the recorded runs. The JSON keeps
 * the names under which the runs were recorded; MB-PLS is low-level fusion,
 * PCA scores are mid-level fusion and the network is a joint model.
 */
const DISPLAY: Record<string, [string, LevelKind]> = {
  'Raman alone': ['Raman seul', 'single'], 'NIRS alone': ['NIRS seul', 'single'], 'MIR alone': ['MIR seul', 'single'],
  'Genetic markers alone': ['Marqueurs seuls', 'single'], 'Grayscale images alone': ['Image seule', 'single'],
  'Early · concatenate': ['Early · concaténation', 'early'], 'Intermediate · MB-PLS': ['Early · MB-PLS', 'early'],
  'Embedding · PCA scores': ['Intermédiaire · scores ACP', 'mid'], 'Intermediate · network': ['Conjoint · réseau', 'joint'],
  'Late · average': ['Late · moyenne', 'late'], 'Late · stacking': ['Late · stacking', 'late'],
}
const EDITS: Record<string, [string, LevelKind]> = {
  'Early · PLS 6': ['Early · PLS 6', 'early'], 'Early · PLS 6 · without MIR': ['Early · PLS 6 · sans MIR', 'early'],
  'Raman alone · PLS 6': ['Raman seul · PLS 6', 'single'], 'Early · PLS 5': ['Early · PLS 5', 'early'],
  'NIRS alone · PLS 5': ['NIRS seul · PLS 5', 'single'], 'Markers alone · PLS 5': ['Marqueurs seuls · PLS 5', 'single'],
  'MB-PLS · 5 components': ['MB-PLS · 5 composantes', 'early'], 'Image alone · PLS 6': ['Image seule · PLS 6', 'single'],
  'Network · 100 epochs': ['Réseau · 100 epochs', 'joint'],
}
function relabel(run: EvidenceRun, table: Record<string, [string, LevelKind]>, key: string): EvidenceRun {
  const entry = table[key]
  if (!entry) throw new Error(`No display name for recorded run ${key}`)
  return run.edit === undefined ? { ...run, name: entry[0], level: entry[1] } : { ...run, edit: entry[0], level: entry[1] }
}
const recorded = raw as unknown as Recorded
export const EVIDENCE: Recorded = { ...recorded, cases: Object.fromEntries(Object.entries(recorded.cases).map(([id, data]) => [id, {
  ...data,
  presets: data.presets.map(run => relabel(run, DISPLAY, run.name)),
  edits: data.edits.map(run => relabel(run, EDITS, run.edit!)),
}])) as Record<CaseId, EvidenceCase> }

export function preset(caseId: CaseId, name: string): EvidenceRun {
  const run = EVIDENCE.cases[caseId].presets.find(item => item.name === name)
  if (!run) throw new Error(`Missing recorded preset ${name} for ${caseId}`)
  return run
}
export function edit(caseId: CaseId, text: string): EvidenceRun {
  const run = EVIDENCE.cases[caseId].edits.find(item => item.edit === text)
  if (!run) throw new Error(`Missing recorded edit "${text}" for ${caseId}`)
  return run
}
export const fmt = (value: number) => value.toFixed(3)
