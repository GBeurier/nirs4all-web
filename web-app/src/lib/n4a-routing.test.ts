import { beforeEach, expect, it, vi } from 'vitest'
import { parseN4aFile } from './n4a'

const route = vi.hoisted(() => ({
  manifest: {} as Record<string, unknown>,
  readArchive: vi.fn(async () => new Uint8Array([1])),
  close: vi.fn(),
  nativeImport: vi.fn(),
}))
vi.mock('@/engine/nirs4all-core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/engine/nirs4all-core')>(),
  openN4aContainer: async () => ({
    manifestBytes: () => new TextEncoder().encode(JSON.stringify(route.manifest)),
    readArchive: route.readArchive,
    close: route.close,
  }),
}))
vi.mock('@/engine/archive-v2', () => ({ importArchiveV2Model: route.nativeImport }))

const nativeFeature = 'native-methods-package@1'
const prediction = { id: 'predict-external', owner: 'dag-ml', operation: 'predict-external', root_artifact: 'model', required_features: [nativeFeature] }
const calibration = { ...prediction, id: 'calibrate-external', operation: 'calibrate-external' }
const file = () => new File([new Uint8Array([1])], 'arbitrary-name.bin')

beforeEach(() => {
  vi.clearAllMocks()
  route.manifest = { required_features: [], artifacts: [], links: [], entrypoints: [] }
})

it('delegates a declared prediction operation to the native validator even without global features', async () => {
  route.manifest.entrypoints = [prediction, { ...calibration, required_features: ['unrelated-calibration@1'] }]
  const refusal = new Error('native validation sentinel; no model is fabricated by this routing test')
  route.nativeImport.mockRejectedValueOnce(refusal)
  await expect(parseN4aFile(file())).rejects.toBe(refusal)
  expect(route.nativeImport).toHaveBeenCalledWith(new Uint8Array([1]), 'arbitrary-name.bin')
  expect(route.close).toHaveBeenCalledOnce()
})

it('does not borrow a calibration entrypoint feature to execute an unknown operation', async () => {
  route.manifest.entrypoints = [{ ...prediction, operation: 'future.predict' }, calibration]
  await expect(parseN4aFile(file())).rejects.toThrow(/readable here but not executable/)
  expect(route.readArchive).not.toHaveBeenCalled()
  expect(route.nativeImport).not.toHaveBeenCalled()
  expect(route.close).toHaveBeenCalledOnce()
})

it('does not infer a prediction operation from a global native feature alone', async () => {
  route.manifest.required_features = [nativeFeature]
  route.manifest.entrypoints = [calibration]
  await expect(parseN4aFile(file())).rejects.toThrow(/readable here but not executable/)
  expect(route.nativeImport).not.toHaveBeenCalled()
})

it('preserves the owner refusal for an unsupported selected prediction requirement', async () => {
  route.manifest.entrypoints = [{ ...prediction, required_features: ['future-native@1'] }, calibration]
  const refusal = new Error('Core: unknown required features for selected predict-external operation')
  route.nativeImport.mockRejectedValueOnce(refusal)
  await expect(parseN4aFile(file())).rejects.toBe(refusal)
  expect(route.nativeImport).toHaveBeenCalledOnce()
  expect(route.close).toHaveBeenCalledOnce()
})
