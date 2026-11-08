import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { importArchiveV2Model } from './archive-v2'

// The accepted native Package2 acceptance (open, replay, descriptor and shape guards, ownership of
// the Methods calls) runs on the genuine Core V1 scenario in package2-cohort.test.ts. The physical
// Archive V2 transports below predate the Core V1 container and stay as intentional historical
// refusals: they are neither converted nor presented as current containers.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/archive-v2/${name}`, import.meta.url))

describe('historical physical Archive V2 transports', () => {
  it('retains and refuses the historical DAG 0.3.23 transport closure', async () => {
    const bytes = fixture('multitarget-pls-dag023.n4a')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '994252030ff80129d0431995bae53eb473082f05825b65714379262b72af13fa',
    )
    await expect(importArchiveV2Model(bytes)).rejects.toThrow(/^n4a unsupported format: only nirs4all\.n4a\.container\.v1 \/ zip-stored\.v1 reader 1 is supported; legacy physical archives are refused; re-export from the producing run with the current native Core container writer$/)
  })

  it.each([
    ['multitarget-pls.n4a', '3a3ff44c6cb33579b561ef68008dbc04157ee0f779133de6b7fc3d67082210cf'],
    ['snv-savgol-pls.n4a', 'ccac47faeeca1d8de493245182bc4a4375d3c487f60f2bfb2b108bddd2339498'],
  ])('refuses the previous physical transport %s instead of replaying it', async (name, sha256) => {
    const bytes = fixture(name)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256)
    await expect(importArchiveV2Model(bytes, name)).rejects.toThrow()
  })

  it('refuses empty bytes without a size ceiling', async () => {
    await expect(importArchiveV2Model(new Uint8Array(0))).rejects.toThrow(/empty/)
  })
})
