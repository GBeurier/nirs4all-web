import raw from './evidence.json'
import type { LevelKind } from './diagrams'

/** Native results recorded from the laboratory; the slides only format them. */
export type CaseId = 'spectroscopy' | 'genetics' | 'images' | 'timeseries'
export interface EvidenceRun {
  name: string
  level: LevelKind
  oofRmse: number
  oofR2: number | null
  testRmse: number
  foldsFingerprint: string
  recipeFingerprint: string
  edit?: string
  /** Best component count of a swept PLS preset (the run kept, by OOF RMSE). */
  components?: number
  /** Every component count of the sweep, when the preset swept it. */
  sweep?: Array<{ components: number; oofRmse: number; testRmse: number }>
  pipeline: unknown[]
}
export interface EvidenceCase {
  dataset: { name: string; samples: number; target: { name: string; unit: string }; sources: Array<{ id: string; label: string; modality: string; representation: string; shape: number[] }> }
  ownerVersions: Record<string, string>
  calibration: number
  holdout: number
  foldsFingerprint: string
  presets: EvidenceRun[]
  edits: EvidenceRun[]
  /** Per-case recording date and data provenance when they differ from the deck defaults. */
  capturedAt?: string
  data?: string
}
type Recorded = { capturedAt: string; source: Record<string, string>; cases: Record<CaseId, EvidenceCase> }

/**
 * Display names (French) and fusion levels for the recorded runs. The JSON keeps
 * the names under which the runs were recorded.
 */
const DISPLAY: Record<string, [string, LevelKind]> = {
  'Raman alone': ['Raman seul', 'single'], 'NIRS alone': ['NIRS seul', 'single'], 'MIR alone': ['MIR seul', 'single'],
  'Genetic markers alone': ['Marqueurs seuls', 'single'], 'Grayscale images alone': ['Image seule', 'single'],
  'Early · concatenate': ['Early · concaténation', 'early'], 'Early · MB-PLS': ['Early · MB-PLS', 'early'],
  'Mid · PCA scores': ['Mid · scores ACP', 'mid'], 'Mid · CNN': ['Mid · CNN', 'mid'],
  'Late · average': ['Late · moyenne', 'late'], 'Late · stacking': ['Late · stacking', 'late'],
  'Vis-SWNIR spectrum alone': ['NIR seul', 'single'], 'Daily weather, 90 days before harvest alone': ['Météo seule', 'single'],
  'Mid · CNN (Burn)': ['Mid · CNN (Burn)', 'mid'], 'Genetic markers · CNN (Burn)': ['Marqueurs · CNN (Burn)', 'single'],
  'Early · random forest': ['Early · forêt aléatoire', 'early'], 'Late · AOM stacking': ['Late · stacking AOM', 'late'],
}
const EDITS: Record<string, [string, LevelKind]> = {
  'Tiny CNN (4 filters, 24 epochs)': ['CNN minuscule', 'mid'],
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
export function sweep(caseId: CaseId, name: string, components: number): { oofRmse: number; testRmse: number } {
  const point = preset(caseId, name).sweep?.find(item => item.components === components)
  if (!point) throw new Error(`Missing ${components}-component sweep point of ${name} for ${caseId}`)
  return point
}
export const fmt = (value: number) => value.toFixed(3)
