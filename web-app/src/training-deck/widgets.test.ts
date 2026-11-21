import { describe, expect, it } from 'vitest'
import { presetDocument } from './widgets'

describe('training deck pipeline views', () => {
  it.each([['spectroscopy', 'early'], ['spectroscopy', 'mid-pca'], ['images', 'cnn'], ['spectroscopy', 'late-stacking']] as const)(
    'resolves the %s %s preset the slides display', (caseId, id) => {
      expect(presetDocument(caseId, id)).toBeTruthy()
    })
})
