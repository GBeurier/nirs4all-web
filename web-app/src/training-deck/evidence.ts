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
export const EVIDENCE = raw as unknown as { capturedAt: string; source: { web: string; ui: string }; cases: Record<CaseId, EvidenceCase> }

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
