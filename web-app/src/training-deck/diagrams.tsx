import type { ReactNode } from 'react'

/**
 * Conceptual SVG diagrams for the training slides, drawn in the nirs4all
 * visual system. They depict structure only: no measured value is drawn here.
 */

export const SOURCE_COLORS = {
  raman: '#be123c', nirs: '#4f46e5', mir: '#a16207', markers: '#15803d', image: '#475569', y: '#0f172a',
} as const
export const LEVEL_COLORS = {
  single: '#64748b', early: '#0891b2', embedding: '#7c3aed', intermediate: '#0d9488', late: '#d97706',
} as const
export type SourceKind = keyof typeof SOURCE_COLORS
export type LevelKind = keyof typeof LEVEL_COLORS

const FONT = 'var(--font)'
const MONO = 'var(--mono)'

/** Deterministic pseudo-spectrum path inside a box (purely decorative motif). */
function spectrumPath(x: number, y: number, w: number, h: number, seed: number): string {
  const points: string[] = []
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    const v = 0.55 * Math.exp(-((t - 0.25 - seed * 0.07) ** 2) / 0.006) + 0.8 * Math.exp(-((t - 0.62 + seed * 0.05) ** 2) / 0.012)
      + 0.25 * Math.sin(t * 9 + seed) * 0.3 + 0.12
    points.push(`${(x + t * w).toFixed(1)},${(y + h - v * h * 0.85).toFixed(1)}`)
  }
  return `M${points.join('L')}`
}

interface BlockProps { x: number; y: number; w: number; h: number; kind: SourceKind; label?: string; sub?: string; motif?: 'spectrum' | 'table' | 'image' | 'scores' | 'none'; seed?: number; faded?: boolean }

/** One source block: a matrix of samples × variables, with a motif telling what it holds. */
export function Block({ x, y, w, h, kind, label, sub, motif = 'spectrum', seed = 1, faded }: BlockProps) {
  const color = SOURCE_COLORS[kind]
  const inner: ReactNode[] = []
  if (motif === 'spectrum') {
    for (let r = 0; r < 3; r++) inner.push(<path key={r} d={spectrumPath(x + 6, y + 8 + r * (h - 16) / 3, w - 12, (h - 16) / 3, seed + r * 0.6)} fill="none" stroke={color} strokeWidth={1.6} opacity={0.85 - r * 0.2} />)
  } else if (motif === 'table' || motif === 'scores') {
    const cols = motif === 'scores' ? 3 : 6, rows = 5
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      inner.push(<rect key={`${r}-${c}`} x={x + 6 + c * (w - 12) / cols + 1} y={y + 6 + r * (h - 12) / rows + 1} width={(w - 12) / cols - 3} height={(h - 12) / rows - 3}
        rx={2} fill={color} opacity={0.12 + ((r * 7 + c * 3 + seed) % 5) * 0.12} />)
    }
  } else if (motif === 'image') {
    const n = 6, size = Math.min(w, h) - 14
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const d = Math.hypot(r - 2.3, c - 3) / 4
      inner.push(<rect key={`${r}-${c}`} x={x + (w - size) / 2 + c * size / n} y={y + (h - size) / 2 + r * size / n} width={size / n} height={size / n} fill={color} opacity={Math.max(0.08, 0.85 - d)} />)
    }
  }
  return (
    <g opacity={faded ? 0.35 : 1}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#fff" stroke={color} strokeWidth={2} />
      {inner}
      {label ? <text x={x + w / 2} y={y - 10} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={17} fill={color}>{label}</text> : null}
      {sub ? <text x={x + w / 2} y={y + h + 20} textAnchor="middle" fontFamily={MONO} fontSize={12.5} fill="var(--text-3)">{sub}</text> : null}
    </g>
  )
}

export function Arrow({ x1, y1, x2, y2, color = 'var(--text-3)', dashed, width = 2 }: { x1: number; y1: number; x2: number; y2: number; color?: string; dashed?: boolean; width?: number }) {
  const angle = Math.atan2(y2 - y1, x2 - x1), head = 9
  const p1 = `${x2 - head * Math.cos(angle - 0.45)},${y2 - head * Math.sin(angle - 0.45)}`
  const p2 = `${x2 - head * Math.cos(angle + 0.45)},${y2 - head * Math.sin(angle + 0.45)}`
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2 - Math.cos(angle) * 4} y2={y2 - Math.sin(angle) * 4} stroke={color} strokeWidth={width} strokeDasharray={dashed ? '6 5' : undefined} />
      <polygon points={`${x2},${y2} ${p1} ${p2}`} fill={color} />
    </g>
  )
}

/** A step box in the nirs4all rack style (accent bar, name, optional detail). */
export function StepBox({ x, y, w = 150, h = 54, title, detail, accent = 'var(--teal)', fill = '#fff', bold }: { x: number; y: number; w?: number; h?: number; title: string; detail?: string; accent?: string; fill?: string; bold?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={fill} stroke="var(--border)" strokeWidth={1.4} />
      <rect x={x + 8} y={y + 9} width={3.5} height={h - 18} rx={2} fill={accent} />
      <text x={x + 20} y={y + (detail ? h / 2 - 3 : h / 2 + 5)} fontFamily={FONT} fontWeight={bold ? 800 : 700} fontSize={15} fill="var(--text)">{title}</text>
      {detail ? <text x={x + 20} y={y + h / 2 + 15} fontFamily={MONO} fontSize={11.5} fill="var(--text-3)">{detail}</text> : null}
    </g>
  )
}

/** Fusion junction marker: where the sources meet. */
export function Junction({ x, y, level, label }: { x: number; y: number; level: LevelKind; label?: string }) {
  const color = LEVEL_COLORS[level]
  return (
    <g>
      <circle cx={x} cy={y} r={15} fill={color} />
      <circle cx={x} cy={y} r={22} fill="none" stroke={color} strokeWidth={2} opacity={0.35} />
      {label ? <text x={x} y={y + 5} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={14} fill="#fff">{label}</text> : null}
    </g>
  )
}

export function Caption({ x, y, children, color = 'var(--text-2)', size = 14, anchor = 'middle', weight = 500 }: { x: number; y: number; children: ReactNode; color?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: number }) {
  return <text x={x} y={y} textAnchor={anchor} fontFamily={FONT} fontSize={size} fontWeight={weight} fill={color}>{children}</text>
}

// ---------------------------------------------------------------------------
// Slide diagrams
// ---------------------------------------------------------------------------

/** One sample, several instruments, one property. */
export function SampleViewsDiagram() {
  const rows: Array<{ kind: SourceKind; label: string; motif: BlockProps['motif']; sub: string }> = [
    { kind: 'nirs', label: 'NIRS', motif: 'spectrum', sub: 'absorbance × wavelength' },
    { kind: 'raman', label: 'Raman', motif: 'spectrum', sub: 'intensity × Raman shift' },
    { kind: 'markers', label: 'Genetic markers', motif: 'table', sub: '0 / 1 / 2 dosages' },
    { kind: 'image', label: 'Image', motif: 'image', sub: 'pixels (height × width)' },
  ]
  return (
    <svg viewBox="0 0 1000 430" role="img" aria-label="One sample measured by four instruments, used to predict one property">
      <g>
        <ellipse cx={120} cy={215} rx={72} ry={72} fill="var(--paper-2)" stroke="var(--border-warm)" strokeWidth={2} />
        <path d="M86 240 q34 -70 68 0 z" fill="#d6b77a" opacity={0.8} />
        <circle cx={104} cy={196} r={9} fill="#b08a4a" opacity={0.75} /><circle cx={134} cy={190} r={7} fill="#b08a4a" opacity={0.65} />
        <Caption x={120} y={312} weight={700} color="var(--text)">One sample</Caption>
      </g>
      {rows.map((row, index) => {
        const y = 22 + index * 102
        return (
          <g key={row.label}>
            <Arrow x1={196} y1={215} x2={360} y2={y + 38} color={SOURCE_COLORS[row.kind]} />
            <Block x={370} y={y + 6} w={190} h={64} kind={row.kind} motif={row.motif} seed={index + 1} />
            <Caption x={580} y={y + 34} anchor="start" weight={700} color={SOURCE_COLORS[row.kind]} size={17}>{row.label}</Caption>
            <Caption x={580} y={y + 56} anchor="start" size={13} color="var(--text-3)">{row.sub}</Caption>
            <Arrow x1={790} y1={y + 38} x2={850} y2={215} color="var(--border)" dashed />
          </g>
        )
      })}
      <rect x={858} y={175} width={130} height={80} rx={14} fill="var(--teal)" />
      <Caption x={923} y={209} color="#fff" weight={800} size={20}>y</Caption>
      <Caption x={923} y={233} color="#fff" size={13}>property</Caption>
    </svg>
  )
}

/** Samples × blocks: the shape of a multisource dataset. */
export function DatasetShapeDiagram() {
  const blocks: Array<{ kind: SourceKind; label: string; w: number; motif: BlockProps['motif']; sub: string }> = [
    { kind: 'nirs', label: 'NIRS', w: 200, motif: 'spectrum', sub: '64 wavelengths (nm)' },
    { kind: 'raman', label: 'Raman', w: 150, motif: 'spectrum', sub: '48 shifts (cm⁻¹)' },
    { kind: 'markers', label: 'Markers', w: 110, motif: 'table', sub: '16 dosages' },
    { kind: 'image', label: 'Image', w: 150, motif: 'image', sub: '12 × 12 pixels' },
  ]
  let x = 170
  return (
    <svg viewBox="0 0 1000 400" role="img" aria-label="A multisource dataset: the same samples in rows, one block of variables per source, and the target">
      {['sample-001', 'sample-002', 'sample-003', '…', 'sample-120'].map((id, index) => (
        <text key={id} x={150} y={92 + index * 50} textAnchor="end" fontFamily={MONO} fontSize={14} fill="var(--text-2)">{id}</text>
      ))}
      {blocks.map((block, index) => {
        const node = <Block key={block.label} x={x} y={62} w={block.w} h={250} kind={block.kind} motif={block.motif} label={block.label} sub={block.sub} seed={index + 2} />
        x += block.w + 22
        return node
      })}
      <g>
        <rect x={x + 10} y={62} width={56} height={250} rx={8} fill="var(--paper-2)" stroke="var(--text)" strokeWidth={2} />
        <Caption x={x + 38} y={50} weight={800} color="var(--text)" size={17}>y</Caption>
        <Caption x={x + 38} y={332} size={12.5} color="var(--text-3)">target</Caption>
      </g>
      <path d={`M170 ${352} H${x - 22}`} stroke="var(--teal)" strokeWidth={2} />
      <path d={`M170 346 v12 M${x - 22} 346 v12`} stroke="var(--teal)" strokeWidth={2} />
      <Caption x={(170 + x - 22) / 2} y={382} color="var(--teal-d)" weight={700} size={15}>X: one block per source · same rows (samples), different columns, axes and units</Caption>
    </svg>
  )
}

/** Join by identity, not by row position; groups stay together. */
export function AlignmentDiagram() {
  const left = ['s-002', 's-003', 's-004', 's-005']
  const right = ['s-004', 's-002', 's-005', 's-003']
  const row = (id: string) => left.indexOf(id)
  return (
    <svg viewBox="0 0 1000 340" role="img" aria-label="Two tables in different row orders joined by sample identity">
      <Caption x={190} y={30} weight={700} color={SOURCE_COLORS.nirs} size={17}>NIRS file</Caption>
      <Caption x={720} y={30} weight={700} color={SOURCE_COLORS.markers} size={17}>Marker file</Caption>
      {left.map((id, index) => (
        <g key={id}>
          <rect x={90} y={50 + index * 62} width={200} height={48} rx={8} fill="#fff" stroke={SOURCE_COLORS.nirs} strokeWidth={1.6} />
          <text x={108} y={80 + index * 62} fontFamily={MONO} fontSize={15} fill="var(--text)">{id}</text>
          <path d={spectrumPath(185, 58 + index * 62, 95, 32, index)} fill="none" stroke={SOURCE_COLORS.nirs} strokeWidth={1.5} />
        </g>
      ))}
      {right.map((id, index) => (
        <g key={id}>
          <rect x={620} y={50 + index * 62} width={200} height={48} rx={8} fill="#fff" stroke={SOURCE_COLORS.markers} strokeWidth={1.6} />
          <text x={638} y={80 + index * 62} fontFamily={MONO} fontSize={15} fill="var(--text)">{id}</text>
          {[0, 1, 2, 3, 4].map(c => <rect key={c} x={720 + c * 18} y={64 + index * 62} width={14} height={20} rx={2} fill={SOURCE_COLORS.markers} opacity={0.2 + ((c + index) % 3) * 0.25} />)}
          <path d={`M290 ${74 + row(id) * 62} C 450 ${74 + row(id) * 62}, 460 ${74 + index * 62}, 620 ${74 + index * 62}`} fill="none" stroke="var(--teal)" strokeWidth={2} />
        </g>
      ))}
      <rect x={850} y={50} width={14} height={110} rx={4} fill="var(--amber)" opacity={0.25} />
      <Caption x={872} y={100} anchor="start" size={13} color="var(--amber)" weight={700}>group: plant 1</Caption>
      <Caption x={872} y={118} anchor="start" size={12} color="var(--text-3)">s-004 + s-002</Caption>
      <Caption x={455} y={325} color="var(--teal-d)" weight={700} size={15}>Matched by sample ID — never by row number</Caption>
    </svg>
  )
}

/** The four places where sources can meet, along one pipeline. */
export function FusionPointsDiagram() {
  const lanes: SourceKind[] = ['nirs', 'raman', 'image']
  const yOf = (index: number) => 70 + index * 95
  const col = { src: 40, pre: 200, rep: 400, model: 600, pred: 800 }
  return (
    <svg viewBox="0 0 1000 400" role="img" aria-label="Four fusion points: early after preprocessing, embedding after compression, intermediate inside the model, late after predictions">
      {['Sources', 'Preprocess', 'Represent', 'Model', 'Predict'].map((label, index) => (
        <Caption key={label} x={[95, 270, 470, 670, 870][index]} y={26} color="var(--text-3)" size={13} weight={700}>{label.toUpperCase()}</Caption>
      ))}
      {lanes.map((kind, index) => {
        const y = yOf(index)
        return (
          <g key={kind}>
            <Block x={col.src} y={y - 26} w={110} h={52} kind={kind} motif={kind === 'image' ? 'image' : 'spectrum'} seed={index + 1} />
            <Arrow x1={150} y1={y} x2={col.pre} y2={y} />
            <StepBox x={col.pre} y={y - 24} w={140} h={48} title="preprocess" accent="var(--cyan)" />
            <Arrow x1={340} y1={y} x2={col.rep} y2={y} />
            <Block x={col.rep} y={y - 22} w={140} h={44} kind={kind} motif="scores" seed={index} />
            <Arrow x1={540} y1={y} x2={col.model} y2={y} />
            <StepBox x={col.model} y={y - 24} w={140} h={48} title="model" accent="var(--teal)" />
            <Arrow x1={740} y1={y} x2={col.pred} y2={y} />
            <rect x={col.pred} y={y - 20} width={60} height={40} rx={8} fill="var(--paper-2)" stroke="var(--border-warm)" />
            <Caption x={col.pred + 30} y={y + 6} weight={700} color="var(--text)">ŷ</Caption>
          </g>
        )
      })}
      <Junction x={370} y={350} level="early" label="1" />
      <Caption x={370} y={392} color={LEVEL_COLORS.early} weight={800}>Early</Caption>
      <Junction x={570} y={350} level="embedding" label="2" />
      <Caption x={570} y={392} color={LEVEL_COLORS.embedding} weight={800}>Embedding</Caption>
      <Junction x={670} y={350} level="intermediate" label="3" />
      <Caption x={690} y={392} color={LEVEL_COLORS.intermediate} weight={800}>Intermediate</Caption>
      <Junction x={900} y={350} level="late" label="4" />
      <Caption x={900} y={392} color={LEVEL_COLORS.late} weight={800}>Late</Caption>
      {[370, 570, 670, 900].map((x, index) => (
        <line key={x} x1={x} y1={42} x2={x} y2={328} stroke={Object.values(LEVEL_COLORS)[index + 1]} strokeWidth={2} strokeDasharray="4 6" opacity={0.7} />
      ))}
    </svg>
  )
}

/** Early fusion: blocks placed side by side, one model. */
export function EarlyDiagram() {
  return (
    <svg viewBox="0 0 1000 330" role="img" aria-label="Early fusion: each block is preprocessed, the columns are concatenated into one matrix and one PLS model is fitted">
      {(['nirs', 'raman', 'mir'] as const).map((kind, index) => (
        <g key={kind}>
          <Block x={20} y={30 + index * 95} w={120} h={60} kind={kind} label={undefined} seed={index + 1} />
          <Caption x={80} y={24 + index * 95} color={SOURCE_COLORS[kind]} weight={700}>{kind === 'mir' ? 'MIR' : kind === 'nirs' ? 'NIRS' : 'Raman'}</Caption>
          <Arrow x1={145} y1={60 + index * 95} x2={185} y2={60 + index * 95} />
          <StepBox x={190} y={36 + index * 95} w={130} h={48} title="scale" accent="var(--cyan)" />
          <path d={`M322 ${60 + index * 95} C 370 ${60 + index * 95}, 370 165, 410 165`} fill="none" stroke="var(--text-3)" strokeWidth={2} />
        </g>
      ))}
      <Junction x={425} y={165} level="early" />
      <Block x={470} y={100} w={88} h={130} kind="nirs" seed={1} />
      <Block x={558} y={100} w={66} h={130} kind="raman" seed={2} />
      <Block x={624} y={100} w={76} h={130} kind="mir" seed={3} />
      <Caption x={585} y={88} color="var(--text)" weight={700}>one matrix: n × (p₁ + p₂ + p₃)</Caption>
      <Arrow x1={708} y1={165} x2={760} y2={165} />
      <StepBox x={765} y={138} w={130} h={54} title="PLS" detail="one model" accent="var(--teal)" />
      <Arrow x1={897} y1={165} x2={935} y2={165} />
      <Caption x={960} y={171} weight={800} color="var(--text)" size={18}>ŷ</Caption>
      <Caption x={720} y={268} color="var(--text-3)" size={14}>the widest or most variable block can dominate</Caption>
      <Caption x={720} y={290} color="var(--text-3)" size={14}>more variables need more latent variables</Caption>
    </svg>
  )
}

/** Embedding fusion: each block compressed to a few scores, scores concatenated. */
export function EmbeddingDiagram() {
  return (
    <svg viewBox="0 0 1000 330" role="img" aria-label="Embedding fusion: each source is compressed into a few PCA scores fitted on training samples, the scores are concatenated and modelled">
      {(['nirs', 'raman', 'image'] as const).map((kind, index) => {
        const y = 30 + index * 95
        return (
          <g key={kind}>
            <Block x={20} y={y} w={kind === 'image' ? 80 : 130} h={60} kind={kind} motif={kind === 'image' ? 'image' : 'spectrum'} seed={index + 1} />
            <Caption x={kind === 'image' ? 60 : 85} y={y - 6} color={SOURCE_COLORS[kind]} weight={700}>{kind === 'nirs' ? 'NIRS · 64 var.' : kind === 'raman' ? 'Raman · 48 var.' : 'Image · 144 px'}</Caption>
            <Arrow x1={155} y1={y + 30} x2={205} y2={y + 30} />
            <StepBox x={210} y={y + 6} w={150} h={48} title="PCA (k = 5)" detail="fit on train" accent={LEVEL_COLORS.embedding} />
            <Arrow x1={362} y1={y + 30} x2={402} y2={y + 30} />
            <Block x={407} y={y + 10} w={48} h={40} kind={kind} motif="scores" seed={index} />
            <path d={`M457 ${y + 30} C 500 ${y + 30}, 500 165, 540 165`} fill="none" stroke="var(--text-3)" strokeWidth={2} />
          </g>
        )
      })}
      <Caption x={431} y={322} color="var(--text-3)" size={12.5}>embeddings</Caption>
      <Junction x={555} y={165} level="embedding" />
      <Block x={595} y={120} w={36} h={90} kind="nirs" motif="scores" />
      <Block x={631} y={120} w={36} h={90} kind="raman" motif="scores" />
      <Block x={667} y={120} w={36} h={90} kind="image" motif="scores" />
      <Caption x={649} y={108} color="var(--text)" weight={700}>n × 15</Caption>
      <Arrow x1={710} y1={165} x2={760} y2={165} />
      <StepBox x={765} y={138} w={130} h={54} title="PLS / Ridge" accent="var(--teal)" />
      <Arrow x1={897} y1={165} x2={935} y2={165} />
      <Caption x={960} y={171} weight={800} color="var(--text)" size={18}>ŷ</Caption>
    </svg>
  )
}

/** Intermediate fusion: blocks kept separate, one model learns from all of them jointly. */
export function IntermediateDiagram() {
  const branch = (kind: SourceKind, y: number, layer: string) => (
    <g key={kind}>
      <Block x={20} y={y} w={kind === 'image' ? 70 : 120} h={56} kind={kind} motif={kind === 'image' ? 'image' : kind === 'markers' ? 'table' : 'spectrum'} />
      <Arrow x1={145} y1={y + 28} x2={190} y2={y + 28} />
      <StepBox x={195} y={y + 4} w={170} h={48} title={layer} detail="learned branch" accent={LEVEL_COLORS.intermediate} />
      <Arrow x1={367} y1={y + 28} x2={402} y2={y + 28} />
      <Block x={407} y={y + 8} w={40} h={40} kind={kind} motif="scores" />
      <path d={`M449 ${y + 28} C 490 ${y + 28}, 490 140, 530 140`} fill="none" stroke="var(--text-3)" strokeWidth={2} />
    </g>
  )
  return (
    <svg viewBox="0 0 1000 300" role="img" aria-label="Intermediate fusion: one learned branch per source, embeddings concatenated, a joint head; branches and head are trained together">
      <rect x={180} y={6} width={600} height={268} rx={16} fill={LEVEL_COLORS.intermediate} opacity={0.06} stroke={LEVEL_COLORS.intermediate} strokeDasharray="6 6" />
      <Caption x={480} y={292} color={LEVEL_COLORS.intermediate} weight={700} size={13.5}>one model, trained as a whole: the branches learn what to keep for y</Caption>
      {branch('nirs', 26, '1-D convolution')}
      {branch('markers', 112, 'dense layer')}
      {branch('image', 198, '2-D convolution')}
      <Junction x={545} y={140} level="intermediate" />
      <StepBox x={590} y={113} w={170} h={54} title="joint head" detail="dense → ŷ" accent="var(--teal)" />
      <Arrow x1={762} y1={140} x2={800} y2={140} />
      <Caption x={822} y={146} weight={800} color="var(--text)" size={18}>ŷ</Caption>
      <g>
        <rect x={845} y={40} width={145} height={200} rx={12} fill="var(--paper-2)" stroke="var(--border-warm)" />
        <Caption x={917} y={70} weight={800} color="var(--text)" size={15}>Chemometric</Caption>
        <Caption x={917} y={90} weight={800} color="var(--text)" size={15}>cousin: MB-PLS</Caption>
        <Caption x={917} y={122} size={12.5}>blocks kept apart</Caption>
        <Caption x={917} y={142} size={12.5}>shared latent</Caption>
        <Caption x={917} y={162} size={12.5}>variables, one</Caption>
        <Caption x={917} y={182} size={12.5}>weight per block</Caption>
      </g>
    </svg>
  )
}

/** Late fusion: one model per source, predictions combined. */
export function LateDiagram() {
  return (
    <svg viewBox="0 0 1000 320" role="img" aria-label="Late fusion: one model per source, the predictions are averaged or given to a meta-model trained on out-of-fold predictions">
      {(['nirs', 'raman', 'mir'] as const).map((kind, index) => {
        const y = 30 + index * 95
        return (
          <g key={kind}>
            <Block x={20} y={y} w={120} h={58} kind={kind} seed={index + 1} />
            <Arrow x1={145} y1={y + 29} x2={185} y2={y + 29} />
            <StepBox x={190} y={y + 5} w={120} h={48} title="scale" accent="var(--cyan)" />
            <Arrow x1={312} y1={y + 29} x2={345} y2={y + 29} />
            <StepBox x={350} y={y + 5} w={120} h={48} title="PLS" accent="var(--teal)" />
            <Arrow x1={472} y1={y + 29} x2={505} y2={y + 29} />
            <rect x={510} y={y + 9} width={64} height={40} rx={8} fill="var(--paper-2)" stroke={SOURCE_COLORS[kind]} />
            <text x={542} y={y + 35} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={16} fill={SOURCE_COLORS[kind]}>ŷ{index + 1}</text>
            <path d={`M576 ${y + 29} C 620 ${y + 29}, 620 155, 650 155`} fill="none" stroke="var(--text-3)" strokeWidth={2} />
          </g>
        )
      })}
      <Junction x={665} y={155} level="late" />
      <StepBox x={705} y={70} w={250} h={58} title="Average" detail="(ŷ₁ + ŷ₂ + ŷ₃) / 3 · nothing learned" accent={LEVEL_COLORS.late} />
      <Caption x={830} y={160} color="var(--text-3)" weight={700}>or</Caption>
      <StepBox x={705} y={180} w={250} h={58} title="Stacking" detail="meta-model on OOF ŷ · learns weights" accent={LEVEL_COLORS.late} />
      <path d="M680 150 L700 100 M680 160 L700 208" stroke="var(--text-3)" strokeWidth={2} fill="none" />
    </svg>
  )
}

/** Out-of-fold predictions: how stacking features are produced honestly. */
export function OofDiagram() {
  const folds = 3
  return (
    <svg viewBox="0 0 1000 300" role="img" aria-label="Out-of-fold predictions: each sample is predicted by a model that did not see it during training">
      {Array.from({ length: folds }, (_, fold) => (
        <g key={fold}>
          <Caption x={70} y={62 + fold * 70} anchor="end" weight={700} color="var(--text)">fold {fold + 1}</Caption>
          {Array.from({ length: folds }, (_, part) => {
            const val = part === fold
            return (
              <g key={part}>
                <rect x={90 + part * 150} y={36 + fold * 70} width={140} height={44} rx={8} fill={val ? 'rgba(217,119,6,.12)' : '#fff'} stroke={val ? 'var(--amber)' : 'var(--border)'} strokeWidth={1.6} />
                <Caption x={160 + part * 150} y={64 + fold * 70} color={val ? 'var(--amber)' : 'var(--text-3)'} weight={val ? 800 : 500}>{val ? 'predict' : 'fit'}</Caption>
              </g>
            )
          })}
          <Arrow x1={545} y1={58 + fold * 70} x2={600} y2={58 + fold * 70} color="var(--amber)" />
        </g>
      ))}
      <rect x={610} y={36} width={150} height={184} rx={10} fill="rgba(217,119,6,.08)" stroke="var(--amber)" strokeWidth={1.6} />
      <Caption x={685} y={120} color="var(--amber)" weight={800} size={16}>OOF ŷ</Caption>
      <Caption x={685} y={142} color="var(--text-3)" size={12.5}>every sample, predicted</Caption>
      <Caption x={685} y={160} color="var(--text-3)" size={12.5}>by a model that</Caption>
      <Caption x={685} y={178} color="var(--text-3)" size={12.5}>never saw it</Caption>
      <Arrow x1={765} y1={128} x2={815} y2={128} />
      <StepBox x={820} y={100} w={160} h={56} title="meta-model" detail="learns the weights" accent={LEVEL_COLORS.late} />
      <Caption x={500} y={270} color="var(--text-2)" size={14}>In-sample predictions look too good: a meta-model trained on them over-trusts the most flexible source.</Caption>
    </svg>
  )
}
