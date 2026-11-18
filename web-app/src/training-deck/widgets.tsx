import { PipelineChainEditor, type PipelineChainDocument } from 'nirs4all-ui/pipelineEditor'
import { fusionPresets, LAB_CATALOG } from '../multimodal/fusion'
import type { LabDataset } from '../multimodal/types'
import { LEVEL_COLORS, type LevelKind } from './diagrams'
import { EVIDENCE, fmt, type CaseId, type EvidenceRun } from './evidence'

const LEVEL_LABEL: Record<LevelKind, string> = {
  single: 'Source seule', early: 'Early · bas niveau', mid: 'Mid fusion', late: 'Late · haut niveau',
}

/** Display-only dataset stand-in: the presets read source IDs and labels only. */
function sourcesOf(caseId: CaseId): LabDataset {
  return { sources: EVIDENCE.cases[caseId].dataset.sources.map(source => ({ ...source, shape: [...source.shape] })) } as unknown as LabDataset
}

export function presetDocument(caseId: CaseId, id: string): PipelineChainDocument {
  const found = fusionPresets(sourcesOf(caseId)).find(preset => preset.id === id)
  if (!found) throw new Error(`Unknown preset ${id}`)
  return found.document
}

/** The laboratory's own rack editor, read-only, showing a real preset pipeline. */
export function PipelineView({ caseId = 'spectroscopy', preset, document, height = 300, zoom = 0.75 }: { caseId?: CaseId; preset?: string; document?: PipelineChainDocument; height?: number; zoom?: number }) {
  const value = document ?? presetDocument(caseId, preset!)
  const dataset = EVIDENCE.cases[caseId].dataset
  return (
    <div className="deck-rack" style={{ height }}>
      <PipelineChainEditor value={value} onChange={() => undefined} catalog={LAB_CATALOG} readOnly variantCount={1}
        inputLabel="Données" inputDetail={dataset.sources.map(source => source.label).join(' · ')}
        outputLabel="Prédiction" defaultWrap={false} defaultZoom={zoom} initialWidth={1200} />
    </div>
  )
}

export function LevelTag({ level, children }: { level: LevelKind; children?: React.ReactNode }) {
  return <span className="deck-tag" style={{ ['--tag' as string]: LEVEL_COLORS[level] }}>{children ?? LEVEL_LABEL[level]}</span>
}

/**
 * Recorded OOF RMSE per recipe (native owner scores, same folds), sorted.
 * Live edits are drawn hatched with their edit described.
 */
export function ResultsChart({ caseId, include, highlight = [] }: { caseId: CaseId; include?: (run: EvidenceRun) => boolean; highlight?: string[] }) {
  const data = EVIDENCE.cases[caseId]
  const runs = [...data.presets, ...data.edits].filter(run => !include || include(run)).sort((a, b) => a.oofRmse - b.oofRmse)
  const max = Math.max(...runs.map(run => run.oofRmse)) * 1.08
  const bestSingle = Math.min(...data.presets.filter(run => run.level === 'single').map(run => run.oofRmse))
  const row = 46, left = 380, width = 480, top = 34
  const height = top + runs.length * row + 34
  const x = (value: number) => left + (value / max) * width
  return (
    <svg className="deck-chart" viewBox={`0 0 960 ${height}`} preserveAspectRatio="xMinYMin meet" role="img"
      aria-label={`RMSE en validation croisée de ${runs.length} recettes sur ${data.dataset.name} ; plus bas = mieux`}>
      <defs>
        <pattern id={`hatch-${caseId}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="#fff" /><rect width="3" height="7" fill="currentColor" />
        </pattern>
      </defs>
      <text x={left} y={18} fontFamily="var(--mono)" fontSize={16} fill="var(--text-3)">RMSE en validation croisée (OOF) · plus bas = mieux</text>
      {runs.map((run, index) => {
        const y = top + index * row
        const color = LEVEL_COLORS[run.level]
        const strong = highlight.includes(run.edit ?? run.name)
        return (
          <g key={`${run.name}-${run.edit ?? ''}`} style={{ color }}>
            <text x={left - 14} y={y + 29} textAnchor="end" fontFamily="var(--font)" fontSize={20} fontWeight={strong ? 800 : 600} fill="var(--text)">
              {run.edit ? `✎ ${run.edit}` : run.name}
            </text>
            <rect x={left} y={y + 8} width={x(run.oofRmse) - left} height={row - 16} rx={5}
              fill={run.edit ? `url(#hatch-${caseId})` : color} stroke={color} strokeWidth={run.edit ? 1.6 : 0} opacity={strong || !highlight.length ? 1 : 0.55} />
            <text x={x(run.oofRmse) + 10} y={y + 29} fontFamily="var(--mono)" fontSize={18} fontWeight={strong ? 800 : 500} fill="var(--text)">{fmt(run.oofRmse)}</text>
          </g>
        )
      })}
      <line x1={x(bestSingle)} y1={top} x2={x(bestSingle)} y2={top + runs.length * row} stroke="var(--text)" strokeDasharray="4 4" strokeWidth={1.4} />
      <text x={x(bestSingle) + 6} y={top + runs.length * row + 22} fontFamily="var(--mono)" fontSize={16} fill="var(--text-2)">meilleure source seule ({fmt(bestSingle)})</text>
    </svg>
  )
}

export function Provenance({ caseId }: { caseId: CaseId }) {
  const data = EVIDENCE.cases[caseId]
  return (
    <p className="deck-provenance">
      Scores natifs enregistrés le {EVIDENCE.capturedAt} dans le labo · DAG-ML {data.ownerVersions.dag} · Methods {data.ownerVersions.methods} · folds {data.foldsFingerprint.slice(0, 10)} · données pédagogiques synthétiques
    </p>
  )
}
