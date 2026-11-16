/** File transport only. IO and Formats parse, decode, validate and align. */
import { loadDataIoWasm } from '../engine/nirs4all-core'
import type { MultimodalDataPreset, MultimodalImportProfile } from 'nirs4all-ui/multimodal'
import type { LabCase, LabDataset } from './types'
import { loadBundledTeachingFile } from './bundled-file'

const ROOT = '../multimodal-data/'
const PRESETS = {
  spectroscopy: 'spectroscopy-complementary', genetics: 'genetics-replicates', images: 'images-spatial',
} as const
export const TEACHING_PRESETS: readonly MultimodalDataPreset[] = [
  { id: PRESETS.spectroscopy, caseId: 'spectroscopy', label: 'Complementary spectral windows',
    description: 'Raman shift, NIRS wavelength and MIR wavenumber. Shared chemistry plus complementary factors and independent nuisance/noise.',
    facts: [{ label: 'Recorded seed', value: '20261116' }, { label: 'Size', value: '120 samples; 48 + 64 + 56 variables' },
      { label: 'Synthesis', value: 'SDK NIRS host; declared offline Raman/MIR latent peak formulas' }] },
  { id: PRESETS.genetics, caseId: 'genetics', label: 'Spectra and replicated genetic material',
    description: 'NIRS plus 16 biallelic dosage markers, shared biological groups and separate measurement IDs. GT phase is discarded in the owner decoder.',
    facts: [{ label: 'Recorded seed', value: '20261117' }, { label: 'Size', value: '120 observations; 60 groups, two replicates' },
      { label: 'Target', value: 'Independent spectral and marker contributions plus group-level chemistry and noise' }] },
  { id: PRESETS.images, caseId: 'images', label: 'Spectra and spatial patterns',
    description: 'NIRS plus 12 × 12 grayscale PNG images. Local spots and stripes carry a complementary latent relationship.',
    facts: [{ label: 'Recorded seed', value: '20261118' }, { label: 'Size', value: '120 samples; 64 wavelengths; 12 × 12 × 1 images' },
      { label: 'Pixel range', value: 'Fixed 8-bit [0,255]; no data-wide learned normalization or resizing' }] },
]
export const IMPORT_PROFILES: readonly MultimodalImportProfile[] = (Object.keys(PRESETS) as LabCase[]).map(caseId => ({
  id: `manifest-${caseId}`, caseId, label: 'Declared multimodal file collection',
  description: 'Select manifest.json and every referenced CSV, VCF or PNG file. Unzip the matching example first. IO joins exact sample IDs; unresolved identities or unsupported records refuse.',
  accept: '.json,.csv,.vcf,.png',
  files: [{ role: 'manifest.json', description: 'nirs4all.multimodal-import.v1 declaration with explicit profiles, source order, columns and axes', required: true },
    { role: 'metadata CSV', description: 'Sample IDs, target, optional group and train/test partition columns', required: true },
    { role: 'Source files', description: 'Every declared source CSV, genotype VCF or image mapping CSV plus 8-bit gray/RGB PNG files', required: true }],
  examples: [{ label: 'Complete matching example (ZIP; unzip before import)', href: `${ROOT}${PRESETS[caseId]}.zip`, fileName: `${PRESETS[caseId]}.zip` },
    { label: 'Manifest and profile documentation', href: `${ROOT}${PRESETS[caseId]}/manifest.json`, fileName: 'manifest.json' }],
}))

interface NamedFile { name: string; bytes: Uint8Array }
interface ImportIo { assembleMultimodalFiles(manifest: string, files: NamedFile[], decode: (profile: string, bytes: Uint8Array, budget: number) => unknown, budget: number): LabDataset }
interface ImportFormats { decodeMultimodalBytes(profile: string, bytes: Uint8Array, budget: number): unknown }
async function assemble(files: NamedFile[], caseId: LabCase): Promise<LabDataset> {
  const manifests = files.filter(file => file.name === 'manifest.json')
  if (manifests.length !== 1) throw new Error('Select exactly one file named manifest.json and all of its declared source files')
  const { formats, io } = await loadDataIoWasm()
  const ownerIo = io as unknown as ImportIo, ownerFormats = formats as unknown as ImportFormats
  if (typeof ownerIo.assembleMultimodalFiles !== 'function' || typeof ownerFormats.decodeMultimodalBytes !== 'function') {
    throw new Error('The staged IO/Formats build lacks the declared multimodal import profile. Rebuild the owner WASM packages.')
  }
  const result = ownerIo.assembleMultimodalFiles(new TextDecoder('utf-8', { fatal: true }).decode(manifests[0].bytes), files,
    (profile, bytes, budget) => ownerFormats.decodeMultimodalBytes(profile, bytes, budget), 64 * 1024 * 1024)
  if (result.caseId !== caseId) throw new Error('The declared dataset case differs from the selected laboratory case')
  return result
}

export async function importLabFiles(files: readonly File[], caseId: LabCase): Promise<LabDataset> {
  // The manifest uses exact collection-relative names. Flat example files also
  // work with an ordinary multiple-file picker; no filename IDs are inferred.
  const names = files.map(file => file.name)
  if (new Set(names).size !== names.length) throw new Error('Input file names are ambiguous; use distinct declared collection names')
  return assemble(await Promise.all(files.map(async file => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }))), caseId)
}

export async function loadTeachingDataset(caseId: LabCase, presetId: string = PRESETS[caseId]): Promise<LabDataset> {
  if (presetId !== PRESETS[caseId]) throw new Error('The selected preset does not belong to this case')
  const inventoryResponse = await loadBundledTeachingFile(presetId, 'files.json')
  if (!inventoryResponse.ok) throw new Error(`Teaching file inventory could not be loaded (${inventoryResponse.status})`)
  const inventory = await inventoryResponse.json() as { schema: string; files: string[] }
  if (inventory.schema !== 'nirs4all.teaching-files.v1' || !Array.isArray(inventory.files) ||
    inventory.files.some(name => typeof name !== 'string' || name.includes('/') || name.includes('\\') || name === '..')) {
    throw new Error('Invalid declared teaching-file inventory')
  }
  const files = await Promise.all(inventory.files.map(async name => {
    const response = await loadBundledTeachingFile(presetId, name)
    if (!response.ok) throw new Error(`Teaching file ${name} could not be loaded (${response.status})`)
    return { name, bytes: new Uint8Array(await response.arrayBuffer()) }
  }))
  return assemble(files, caseId)
}
