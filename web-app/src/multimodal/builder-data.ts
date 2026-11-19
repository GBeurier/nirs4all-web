/** Dataset Builder transport/DTO adapter. Parsing and identity validation remain in IO/Formats. */
import type {
  MultimodalBuilderDraft, MultimodalBuilderFile, MultimodalBuilderSource,
  MultimodalBuilderValidation,
} from 'nirs4all-ui/datasetBuilder'
import { loadDataIoWasm } from '../engine/nirs4all-core'
import type { LabCase, LabDataset } from './types'

export interface BuilderInput { name: string; bytes: Uint8Array }
interface TableDescription {
  name: string; readable: boolean; refusal?: string; n_rows: number | null
  identity: { column: string } | null
  columns: Array<{ name: string; dtype: string; preview: string | null; role: { role: string } }>
  warnings: string[]
}
interface DecodedGenotype { kind: 'genotype'; sample_ids: string[]; variant_ids: string[]; data: ArrayLike<number>; validity: ArrayLike<number>; warnings: string[] }
interface DecodedImage { kind: 'image'; shape: Array<number | bigint>; warnings: string[] }
interface OwnerIo {
  describeTables(files: BuilderInput[], options: { params: Record<string, unknown> }): TableDescription[]
  assembleMultimodalFiles(manifest: string, files: readonly BuilderInput[], decode: (profile: string, bytes: Uint8Array, budget: number) => unknown, budget: number): LabDataset
}
interface OwnerFormats { decodeMultimodalBytes(profile: string, bytes: Uint8Array, budget: number): DecodedGenotype | DecodedImage }
interface ManifestSource {
  id: string; label: string; modality: 'spectroscopy' | 'genetics' | 'image'
  profile: 'numeric_csv' | 'vcf_gt_dosage' | 'png_manifest'; file: string
  sampleId?: string; features?: string[]; axis?: { values: number[]; kind: string; unit: string }; shape?: number[]
}
export interface BuilderManifest {
  schema: 'nirs4all.multimodal-import.v1'; caseId: LabCase; name: string
  metadata: { file: string; sampleId: string; target: string; targetUnit: string; group?: string; partition?: string
    targetKind?: 'categorical'; classes?: string[] }
  sources: ManifestSource[]; provenance: Record<string, unknown>
}
/** A categorical target (ordered class vocabulary) declared by the optional manifest for one metadata column. */
export interface DeclaredTarget { file: string; target: string; targetKind: 'categorical'; classes: string[] }
export interface InspectedBuilderFiles {
  inputs: BuilderInput[]; inventory: MultimodalBuilderFile[]; draft: MultimodalBuilderDraft
  provenance: Record<string, unknown>; declaredTarget?: DeclaredTarget
}
const BUDGET = 64 * 1024 * 1024

function kind(name: string): MultimodalBuilderFile['kind'] {
  const extension = name.split('.').pop()?.toLowerCase()
  return extension === 'csv' ? 'table' : extension === 'vcf' ? 'vcf' : extension === 'png' ? 'image'
    : name === 'manifest.json' ? 'manifest' : 'other'
}
function declaredDraft(source: MultimodalBuilderSource, manifest?: BuilderManifest): MultimodalBuilderSource {
  const declaration = manifest?.sources.find(entry => entry.file === source.file)
  const metadata = manifest?.metadata.file === source.file ? manifest.metadata : undefined
  if (!declaration && !metadata) return manifest ? { ...source, role: 'ignored' } : source
  const features = declaration?.features ?? source.features
  return {
    ...source,
    ...(declaration ? { id: declaration.id, label: declaration.label, modality: declaration.modality,
      profile: declaration.profile, sampleId: declaration.sampleId ?? source.sampleId,
      features, shape: declaration.shape ?? source.shape,
      axisMode: declaration.axis ? 'declared' : 'none', axisUnit: declaration.axis?.unit ?? '',
      axisKind: declaration.axis?.kind ?? 'wavelength',
      coordinates: declaration.axis ? Object.fromEntries(features.map((name, index) => [name, declaration.axis!.values[index]])) : undefined } as const : {}),
    role: metadata ? declaration ? 'combined' : 'metadata' : 'source',
    ...(metadata ? { sampleId: metadata.sampleId, target: metadata.target, targetUnit: metadata.targetUnit,
      group: metadata.group ?? '', partition: metadata.partition ?? '' } : {}),
  }
}

export async function inspectBuilderFiles(files: readonly File[], previous?: MultimodalBuilderDraft): Promise<InspectedBuilderFiles> {
  const names = files.map(file => file.name)
  if (new Set(names).size !== names.length) throw new Error('File names must be distinct. Rename ambiguous files before adding them.')
  const inputs = await Promise.all(files.map(async file => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })))
  const manifestInput = inputs.find(input => input.name === 'manifest.json')
  const manifest = manifestInput ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestInput.bytes)) as BuilderManifest : undefined
  if (manifest && (manifest.schema !== 'nirs4all.multimodal-import.v1' || !manifest.metadata || !Array.isArray(manifest.sources))) {
    throw new Error('The optional manifest must use nirs4all.multimodal-import.v1. Files can also be added without a manifest.')
  }
  if (manifest && new Set(manifest.sources.map(source => source.file)).size !== manifest.sources.length) {
    throw new Error('This wizard maps one measurement block per file. Separate blocks into distinct files before importing this manifest.')
  }
  if (manifest && new Set(manifest.sources.map(source => source.id)).size !== manifest.sources.length) {
    throw new Error('The optional manifest must declare distinct measurement source IDs')
  }
  const { io, formats } = await loadDataIoWasm()
  const ownerIo = io as unknown as OwnerIo, ownerFormats = formats as unknown as OwnerFormats
  const inputKind = (name: string): MultimodalBuilderFile['kind'] => {
    if (name === manifest?.metadata.file) return 'table'
    const declaration = manifest?.sources.find(source => source.file === name)
    return declaration ? declaration.profile === 'vcf_gt_dosage' ? 'vcf' : 'table' : kind(name)
  }
  const needsInspection = (name: string) => !manifest || name === manifest.metadata.file ||
    manifest.sources.some(source => source.file === name) ||
    previous?.sources.some(source => source.file === name && source.role !== 'ignored')
  const csvInputs = inputs.filter(input => inputKind(input.name) === 'table' && needsInspection(input.name))
  const descriptions = ownerIo.describeTables(csvInputs, { params: Object.fromEntries(csvInputs.map(input => [input.name,
    { has_header: true, delimiter: ',', decimal_separator: '.', encoding: 'utf-8' }])) })
  const firstImage = !manifest ? inputs.find(input => inputKind(input.name) === 'image') : undefined
  const imageShape = firstImage ? ownerFormats.decodeMultimodalBytes('png8', firstImage.bytes, BUDGET) : null
  const sources: MultimodalBuilderSource[] = []
  const mappingNames = new Set(inputs.filter(input => ['table', 'vcf'].includes(inputKind(input.name))).map(input => input.name))
  if (manifest) {
    mappingNames.add(manifest.metadata.file)
    for (const source of manifest.sources) mappingNames.add(source.file)
  }
  for (const name of mappingNames) {
    const input = inputs.find(file => file.name === name)
    const description = descriptions.find(table => table.name === name)
    const base: MultimodalBuilderSource = {
      id: name, file: name, label: name, role: 'source',
      profile: inputKind(name) === 'vcf' ? 'vcf_gt_dosage' : 'numeric_csv',
      modality: inputKind(name) === 'vcf' ? 'genetics' : 'spectroscopy', columns: [], rowCount: null,
      sampleId: description?.identity?.column ?? '', target: '', targetUnit: '', group: '', partition: '',
      features: [], axisMode: 'none', axisKind: 'wavelength', axisUnit: '', shape: [],
      warnings: needsInspection(name) ? [] : ['Not referenced by this configuration. Choose a role other than Ignore to inspect this table.'],
      ...(!input ? { refusal: `Add the declared file ${name}, or explicitly change its role to Ignore.` } : {}),
    }
    if (input && inputKind(name) === 'vcf' && needsInspection(name)) {
      const genotype = ownerFormats.decodeMultimodalBytes('vcf_gt_dosage', input.bytes, BUDGET)
      if (genotype.kind !== 'genotype') throw new Error('Formats returned a non-genotype record for the VCF profile')
      base.profile = 'vcf_gt_dosage'; base.modality = 'genetics'; base.rowCount = genotype.sample_ids.length
      base.columns = genotype.variant_ids.map((name, index) => ({ name, kind: 'numeric',
        preview: genotype.validity[index] ? String(genotype.data[index]) : null }))
      base.features = genotype.variant_ids; base.warnings = genotype.warnings
    } else if (description) {
      base.columns = description.columns.map(column => ({ name: column.name, kind: column.dtype, preview: column.preview }))
      base.rowCount = description.n_rows; base.warnings = description.warnings
      if (!description.readable) base.refusal = description.refusal ?? 'The IO owner could not inspect this table'
      const suggested = (role: string) => description.columns.find(column => column.role.role === role)?.name ?? ''
      base.target = suggested('targets'); base.group = suggested('group'); base.partition = suggested('partition')
      const reserved = [base.sampleId, base.target, base.group, base.partition]
      base.features = description.columns.filter(column => column.dtype === 'numeric' && !reserved.includes(column.name)).map(column => column.name)
      if (base.target) base.role = base.features.length ? 'combined' : 'metadata'
      // This profile's fixed mapping columns are declared here, never inferred into sample identities.
      if (base.columns.some(column => column.name === 'file') && base.columns.some(column => column.name === 'sample_id')) {
        base.profile = 'png_manifest'; base.modality = 'image'; base.sampleId = 'sample_id'
        // Formats' native usize values cross wasm-bindgen as bigint. PNG dimensions
        // are bounded by the format's u32 fields, so this UI count conversion is exact.
        base.shape = imageShape?.kind === 'image' ? imageShape.shape.map(Number) : []
      }
    }
    const prior = previous?.sources.find(source => source.file === name)
    sources.push(prior ? { ...base, ...prior, columns: base.columns, rowCount: base.rowCount,
      warnings: base.warnings, refusal: base.refusal } : declaredDraft(base, manifest))
  }
  if (manifest) sources.sort((left, right) => {
    const rank = (file: string) => file === manifest.metadata.file ? -1 : manifest.sources.findIndex(source => source.file === file)
    return rank(left.file) - rank(right.file)
  })
  const sourceIds = new Set(sources.filter(source => source.role === 'source' || source.role === 'combined').map(source => source.id))
  for (const source of sources.filter(source => source.role === 'metadata' || source.role === 'ignored')) {
    while (sourceIds.has(source.id)) source.id = `metadata:${source.id}`
    sourceIds.add(source.id)
  }
  return { inputs, inventory: files.map(file => ({ name: file.name, size: file.size, kind: inputKind(file.name) })),
    draft: { name: previous?.name ?? manifest?.name ?? 'my-dataset', sources }, provenance: manifest?.provenance ?? {},
    ...(manifest?.metadata.targetKind ? { declaredTarget: { file: manifest.metadata.file, target: manifest.metadata.target,
      targetKind: manifest.metadata.targetKind, classes: manifest.metadata.classes ?? [] } } : {}) }
}

/** Serialize explicit user choices into the owner's existing import contract. */
export function buildBuilderManifest(draft: MultimodalBuilderDraft, caseId: LabCase, provenance: Record<string, unknown> = {},
  declaredTarget?: DeclaredTarget): BuilderManifest {
  const metadata = draft.sources.filter(source => source.role === 'metadata' || source.role === 'combined')
  if (metadata.length !== 1) throw new Error('Choose exactly one table for the target and sample metadata')
  const meta = metadata[0]
  if (meta.refusal) throw new Error(`${meta.file}: ${meta.refusal}`)
  if (!meta.sampleId || !meta.target) throw new Error('Choose the metadata sample ID and target columns')
  // The manifest's class vocabulary applies only while its declared column stays the target; IO validates every label.
  const categorical = declaredTarget && declaredTarget.file === meta.file && declaredTarget.target === meta.target ? declaredTarget : undefined
  const sources = draft.sources.filter(source => source.role === 'source' || source.role === 'combined').map(source => {
    if (source.refusal) throw new Error(`${source.file}: ${source.refusal}`)
    const declaration: ManifestSource = { id: source.id, label: source.label, modality: source.modality, profile: source.profile, file: source.file }
    if (source.profile === 'numeric_csv') {
      if (!source.sampleId || source.features.length === 0) throw new Error(`${source.label}: choose a sample ID and at least one feature`)
      const reserved = [source.sampleId, ...(source.file === meta.file ? [meta.target, meta.group, meta.partition] : [])].filter(Boolean)
      if (source.features.some(name => reserved.includes(name))) throw new Error(`${source.label}: identity, target, group and partition columns cannot also be features`)
      declaration.sampleId = source.sampleId; declaration.features = [...source.features]
      if (source.axisMode !== 'none') {
        const values = source.features.map(name => source.axisMode === 'headers' ? (name.trim() ? Number(name) : NaN) : source.coordinates?.[name] ?? NaN)
        if (values.some(value => !Number.isFinite(value))) throw new Error(`${source.label}: selected features need finite explicit axis coordinates`)
        declaration.axis = { values, unit: source.axisUnit, kind: source.axisKind }
      }
    } else if (source.profile === 'png_manifest') {
      if (!source.columns.some(column => column.name === 'sample_id') || !source.columns.some(column => column.name === 'file')) {
        throw new Error(`${source.label}: the PNG mapping profile requires sample_id and file columns`)
      }
      declaration.shape = [...source.shape]
    }
    return declaration
  })
  if (sources.length === 0) throw new Error('Choose at least one measurement source')
  return { schema: 'nirs4all.multimodal-import.v1', caseId, name: draft.name,
    metadata: { file: meta.file, sampleId: meta.sampleId, target: meta.target, targetUnit: meta.targetUnit,
      ...(meta.group ? { group: meta.group } : {}), ...(meta.partition ? { partition: meta.partition } : {}),
      ...(categorical ? { targetKind: categorical.targetKind, classes: [...categorical.classes] } : {}) },
    sources, provenance }
}

/**
 * The analysis kind follows the declared source modalities: any image source makes
 * a spectra-and-images dataset, any marker table a spectra-and-markers one.
 */
export function inferBuilderCase(draft: MultimodalBuilderDraft): LabCase {
  const modalities = new Set(draft.sources.filter(source => source.role === 'source' || source.role === 'combined').map(source => source.modality))
  return modalities.has('image') ? 'images' : modalities.has('genetics') ? 'genetics' : 'spectroscopy'
}

export async function validateBuilderDraft(draft: MultimodalBuilderDraft, inputs: readonly BuilderInput[], provenance: Record<string, unknown>,
  declaredTarget?: DeclaredTarget) {
  const manifest = buildBuilderManifest(draft, inferBuilderCase(draft), provenance, declaredTarget)
  const { io, formats } = await loadDataIoWasm()
  const ownerIo = io as unknown as OwnerIo, ownerFormats = formats as unknown as OwnerFormats
  const dataset = ownerIo.assembleMultimodalFiles(JSON.stringify(manifest), inputs,
    (profile, bytes, budget) => ownerFormats.decodeMultimodalBytes(profile, bytes, budget), BUDGET)
  const missingCells = (source: LabDataset['sources'][number]) => source.validity ? Array.from(source.validity).filter(value => value === 0).length : 0
  const sources = dataset.sources.map(source => ({ id: source.id, label: source.label,
    ...(dataset.alignment.find(entry => entry.sourceId === source.id) ?? { matched: 0, missing: 0, refused: 0 }), missingCells: missingCells(source) }))
  const incomplete = sources.some(source => source.missingCells > 0)
  const validation: MultimodalBuilderValidation = { status: 'valid', message: 'IO validated the exact sample identities, declared columns and source geometry.',
    samples: dataset.sampleIds.length, groups: dataset.groupIds ? new Set(dataset.groupIds).size : 0,
    ...(dataset.partitions ? { calibration: dataset.partitions.filter(value => value === 'train').length,
      holdout: dataset.partitions.filter(value => value === 'test').length } : {}), fingerprint: dataset.fingerprint, sources }
  if (incomplete) {
    return { dataset: null, validation: { ...validation, status: 'error' as const,
      message: 'Alignment succeeded, but this complete-data training profile refuses missing cells. Resolve the reported missing values before creating the dataset.' } }
  }
  return { dataset, validation }
}
