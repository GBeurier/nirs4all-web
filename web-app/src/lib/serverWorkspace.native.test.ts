import { expect, it, vi } from 'vitest'
import { openN4aContainer } from '@/engine/nirs4all-core'
import { createWebWorkspaceArchive, readWebWorkspaceArchive, type WebWorkspaceInput } from './serverWorkspace'

it('rejects another internally valid same-size Core workspace before applying restored state', async () => {
  const input = (name: string): WebWorkspaceInput => ({
    pipeline: { name, steps: [] }, editor: { step: 'dataset', theme: 'light' },
    dataset: null, selectedRun: null, loadedModel: null, loadedModelArchive: null,
  })
  const consent = { includeDataset: false, includeModel: false, allowTrainingRows: false }
  const engine = { exportModel: vi.fn() }
  const expected = await createWebWorkspaceArchive(input('Workspace A'), consent, engine)
  const substitute = await createWebWorkspaceArchive(input('Workspace B'), consent, engine)
  expect(substitute.size).toBe(expected.size)
  const first = await openN4aContainer(expected)
  const second = await openN4aContainer(substitute)
  let expectedSha = ''
  try {
    expect(first.kind).toBe('external')
    expect(second.kind).toBe('external')
    expectedSha = first.view().readability.container_sha256
    expect(second.view().readability.container_sha256).not.toBe(expectedSha)
  } finally {
    first.close()
    second.close()
  }
  const valid = await readWebWorkspaceArchive(expected, expectedSha)
  expect(valid.pipeline.name).toBe('Workspace A')
  const onRestore = vi.fn()
  await expect(readWebWorkspaceArchive(substitute, expectedSha).then(onRestore)).rejects.toThrow(/server artifact SHA-256/)
  expect(onRestore).not.toHaveBeenCalled()
})
