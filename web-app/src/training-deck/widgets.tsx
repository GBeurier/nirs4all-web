import { PipelineChainEditor, type PipelineChainDocument } from 'nirs4all-ui/pipelineEditor'
import { fusionPresets, LAB_CATALOG } from '../multimodal/fusion'
import type { LabDataset } from '../multimodal/types'
import { LEVEL_COLORS, type LevelKind } from './diagrams'
import { EVIDENCE, fmt, type CaseId, type EvidenceRun } from './evidence'

const LEVEL_LABEL: Record<LevelKind, string> = {
  single: 'Source seule', early: 'Early · bas niveau', mid: 'Mid fusion', late: 'Late · haut niveau',
}

/** Display-only dataset stand-in: the presets read source IDs, labels and the (numeric) target kind only. */
function sourcesOf(caseId: CaseId): LabDataset {
  return { sources: EVIDENCE.cases[caseId].dataset.sources.map(source => ({ ...source, shape: [...source.shape] })),
    target: { name: 'y', unit: '', values: new Float64Array(0) } } as unknown as LabDataset
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

/** Readable axis ticks: 4–6 round values from 0 to `max`. */
function ticks(max: number): number[] {
  const raw = max / 5, power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(f => f * power).find(f => max / f <= 6) ?? 10 * power
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, index) => Number((index * step).toPrecision(6)))
}

/**
 * Recorded native scores per recipe on one fold set: OOF RMSE (bars) and
 * held-out test RMSE (diamonds), sorted by OOF. Live edits are outlined bars.
 */
export function ResultsChart({ caseId, include, highlight = [] }: { caseId: CaseId; include?: (run: EvidenceRun) => boolean; highlight?: string[] }) {
  const data = EVIDENCE.cases[caseId]
  const runs = [...data.presets, ...data.edits].filter(run => !include || include(run)).sort((a, b) => a.oofRmse - b.oofRmse)
  const axisMax = Math.max(...runs.flatMap(run => [run.oofRmse, run.testRmse])) * 1.06
  const grid = ticks(axisMax)
  const max = Math.max(axisMax, grid[grid.length - 1])
  const bestSingle = Math.min(...data.presets.filter(run => run.level === 'single').map(run => run.oofRmse))
  const levels = (['single', 'early', 'mid', 'late'] as const).filter(level => runs.some(run => run.level === level))
  const edited = runs.some(run => run.edit)
  const row = 42, left = 360, width = 500, top = 34
  const bottom = top + runs.length * row
  const height = bottom + 128
  const x = (value: number) => left + (value / max) * width
  const unit = data.dataset.target.unit ? ` (${data.dataset.target.unit})` : ''
  return (
    <svg className="deck-chart" viewBox={`0 0 960 ${height}`} preserveAspectRatio="xMinYMin meet" role="img"
      aria-label={`RMSE en validation croisée et sur le test de ${runs.length} recettes sur ${data.dataset.name} ; plus bas = mieux`}>
      {/* Axis grid and ticks. */}
      {grid.map(value => (
        <g key={value}>
          <line x1={x(value)} y1={top - 4} x2={x(value)} y2={bottom} stroke="var(--border-warm)" strokeWidth={1.2} />
          <text x={x(value)} y={bottom + 20} textAnchor="middle" fontFamily="var(--mono)" fontSize={14} fill="var(--text-3)">{fmt(value)}</text>
        </g>
      ))}
      <line x1={left} y1={bottom} x2={left + width} y2={bottom} stroke="var(--text-3)" strokeWidth={1.2} />
      <text x={left + width / 2} y={bottom + 44} textAnchor="middle" fontFamily="var(--font)" fontSize={15} fill="var(--text-2)">
        RMSE{unit} · plus bas = mieux
      </text>
      {/* Legend under the axis: fusion level colours, then the marks. */}
      <g fontFamily="var(--font)" fontSize={16} fill="var(--text-2)" transform={`translate(${left - 200}, ${bottom + 74})`}>
        {levels.reduce<{ x: number; items: JSX.Element[] }>((acc, level) => {
          const label = LEVEL_LABEL[level].split(' · ')[0]
          acc.items.push(<g key={level} transform={`translate(${acc.x}, 0)`}><rect width={16} height={16} rx={3} fill={LEVEL_COLORS[level]} fillOpacity={0.85} /><text x={22} y={13}>{label}</text></g>)
          acc.x += 34 + label.length * 9
          return acc
        }, { x: 0, items: [] }).items}
      </g>
      <g fontFamily="var(--font)" fontSize={16} fill="var(--text-2)" transform={`translate(${left - 200}, ${bottom + 104})`}>
        <rect width={26} height={14} rx={3} fill="var(--text-3)" fillOpacity={0.6} y={1} />
        <text x={32} y={13}>RMSE OOF (CV)</text>
        <path d="M 178 1 l 7 7 l -7 7 l -7 -7 z" fill="#fff" stroke="var(--text)" strokeWidth={1.6} />
        <text x={192} y={13}>RMSE test (jamais vu)</text>
        <line x1={398} y1={0} x2={398} y2={16} stroke="var(--text)" strokeDasharray="4 3" strokeWidth={1.4} />
        <text x={406} y={13}>meilleure source seule</text>
        {edited ? <><rect x={616} y={1} width={26} height={14} rx={3} fill="#fff" stroke="var(--text-3)" strokeWidth={1.8} /><text x={648} y={13}>✎ modif. en direct</text></> : null}
      </g>
      {runs.map((run, index) => {
        const y = top + index * row
        const color = LEVEL_COLORS[run.level]
        const strong = highlight.includes(run.edit ?? run.name)
        const dim = strong || !highlight.length ? 1 : 0.5
        return (
          <g key={`${run.name}-${run.edit ?? ''}`} opacity={dim}>
            <text x={left - 12} y={y + 26} textAnchor="end" fontFamily="var(--font)" fontSize={19} fontWeight={strong ? 800 : 600} fill="var(--text)">
              {run.edit ? `✎ ${run.edit}` : run.name}
            </text>
            <rect x={left} y={y + 9} width={x(run.oofRmse) - left} height={row - 18} rx={4}
              fill={run.edit ? '#fff' : color} fillOpacity={run.edit ? 1 : 0.85} stroke={color} strokeWidth={run.edit ? 1.8 : 0} />
            <path d={`M ${x(run.testRmse)} ${y + 13} l 7 8 l -7 8 l -7 -8 z`} fill="#fff" stroke="var(--text)" strokeWidth={1.6} />
            <text x={Math.max(x(run.oofRmse), x(run.testRmse)) + 12} y={y + 26} fontFamily="var(--mono)" fontSize={16} fontWeight={strong ? 800 : 500} fill="var(--text)">
              {fmt(run.oofRmse)} <tspan fill="var(--text-3)">◆ {fmt(run.testRmse)}</tspan>
            </text>
          </g>
        )
      })}
      <line x1={x(bestSingle)} y1={top - 4} x2={x(bestSingle)} y2={bottom} stroke="var(--text)" strokeDasharray="5 4" strokeWidth={1.4} />
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
