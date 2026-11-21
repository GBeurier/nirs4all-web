/** File transport only. IO and Formats parse, decode, validate and align. */
import { loadDataIoWasm } from '../engine/nirs4all-core'
import type { MultimodalDataPreset } from 'nirs4all-ui/multimodal'
import type { LabCase, LabDataset } from './types'
import { loadBundledTeachingFile } from './bundled-file'

const PRESETS = {
  spectroscopy: 'spectroscopy-complementary', genetics: 'genetics-replicates', images: 'images-spatial',
  timeseries: 'mango-dry-matter-weather',
} as const
/** The shared preset view model, widened to the laboratory's own cases (including time series). */
export type LabDataPreset = Omit<MultimodalDataPreset, 'caseId'> & { caseId: LabCase }
export const TEACHING_PRESETS: readonly LabDataPreset[] = [
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
  { id: 'wheat-phenomic-rincent2018', caseId: 'genetics', label: 'Wheat varieties: NIRS and SNP markers (real data)',
    description: 'Public phenomic-prediction data: grain and leaf NIRS of an irrigated trial and SNP markers of 223 wheat varieties; target = grain yield. Rincent et al. (2018), doi:10.15454/MB4G3T, Licence Ouverte / Etalab 2.0; derived subset. The spectra are published already pre-treated (normalized 1st derivative).',
    facts: [{ label: 'Size', value: '223 varieties; 2 × 525 wavelengths (400–2496 nm); 2000 SNPs (0/1/2)' },
      { label: 'Target', value: 'Grain yield, irrigated trial' },
      { label: 'Partition', value: 'Declared: 178 calibration / 45 test varieties' }] },
  { id: 'rice-varieties', caseId: 'images', label: 'Rice varieties (real data, classification)',
    description: 'Public rice kernels of 10 varieties: an RGB image and three hyperspectral pixel spectra (383–1006 nm) per kernel. Vu et al. (2020), doi:10.5281/zenodo.3241923, CC BY 4.0; derived subset. Each variety comes from one imaging bundle, so variety is confounded with acquisition.',
    facts: [{ label: 'Size', value: '240 kernels (24 per variety); 3 × 256 bands; 32 × 32 RGB' },
      { label: 'Target', value: 'Variety, 10 classes (declared vocabulary)' },
      { label: 'Partition', value: 'Declared: 19 calibration / 5 test kernels per variety' }] },
  { id: PRESETS.timeseries, caseId: 'timeseries', label: 'Mango dry matter: NIR and pre-harvest weather (real data)',
    description: 'Public mango fruit: one Vis-SWNIR spectrum (405–1137 nm) per fruit and the daily weather of the 90 days before its harvest (max/min temperature, rain, radiation) as one multivariate series. Anderson et al., Mendeley Data v6 (2026), doi:10.17632/46htwnp833.6, CC BY 4.0; weather from Open-Meteo (ERA5), CC BY 4.0; derived subset, not comparable with the publications’ own splits. Orchard locations are not published: weather is regional and shared within a harvest.',
    facts: [{ label: 'Size', value: '565 fruits; 245 bands; 90 days × 4 weather variables' },
      { label: 'Target', value: 'Dry matter (% DM)' },
      { label: 'Validation', value: 'Declared seasons 1–3 calibration / season 4 test; folds grouped by region × season' }] },
]
interface NamedFile { name: string; bytes: Uint8Array }
interface ImportIo { assembleMultimodalFiles(manifest: string, files: NamedFile[], decode: (profile: string, bytes: Uint8Array, budget: number) => unknown, budget: number): LabDataset }
interface ImportFormats { decodeMultimodalBytes(profile: string, bytes: Uint8Array, budget: number): unknown }
/**
 * IO names a multivariate series by its variables. Execution reads one named column
 * per stored value, so the host names each flattened column `variable@time`
 * (time-major, the IO storage order) and keeps the variables for display.
 */
export function withSeriesColumns(dataset: LabDataset): LabDataset {
  return { ...dataset, sources: dataset.sources.map(source => {
    if (source.representation !== 'series_mv') return source
    const [steps, variables] = source.shape
    if (source.featureNames.length !== variables || source.axis?.values.length !== steps) throw new Error(`Time series ${source.id} has an inconsistent shape`)
    return { ...source, variables: [...source.featureNames],
      featureNames: source.axis.values.flatMap(time => source.featureNames.map(name => `${name}@${time}`)) }
  }) }
}

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
  return withSeriesColumns(result)
}

export async function loadTeachingDataset(caseId: LabCase, presetId: string = PRESETS[caseId]): Promise<LabDataset> {
  if (TEACHING_PRESETS.find(preset => preset.id === presetId)?.caseId !== caseId) throw new Error('The selected preset does not belong to this case')
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
