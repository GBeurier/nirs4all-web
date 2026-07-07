import { existsSync, readFileSync } from 'node:fs'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { RuntimeEngineBadge } from 'nirs4all-ui/components'
import { getMetricDefinition, isLowerBetter } from 'nirs4all-ui/score'
import { runtimeEngineLabel } from 'nirs4all-ui/runtime'
import { getNirs4allBrandDefinition } from 'nirs4all-ui/brand'
import { getNirs4allStyleAsset } from 'nirs4all-ui/styles'
import { metricChips, primaryMetric } from '@/lib/format'

describe('shared nirs4all-ui contract', () => {
  it('keeps Web metric labels and score direction aligned with nirs4all-ui/score', () => {
    const regression = primaryMetric('regression')
    const rmse = getMetricDefinition('rmse')
    expect(regression).toEqual({
      key: 'rmse',
      label: rmse?.label,
      higherIsBetter: !isLowerBetter('rmse'),
    })

    expect(metricChips('regression')).toEqual([
      { key: 'rmse', label: getMetricDefinition('rmse')?.abbreviation },
      { key: 'r2', label: getMetricDefinition('r2')?.abbreviation },
      { key: 'mae', label: getMetricDefinition('mae')?.abbreviation },
    ])

    const binary = primaryMetric('binary')
    expect(binary).toEqual({
      key: 'accuracy',
      label: getMetricDefinition('accuracy')?.label,
      higherIsBetter: !isLowerBetter('accuracy'),
    })
  })

  it('renders the runtime engine badge from nirs4all-ui/components', () => {
    const lineage = { compiled: true, executed: true }
    const label = runtimeEngineLabel(lineage)
    const element = RuntimeEngineBadge({ lineage, className: 'shared-runtime' }) as ReactElement<{
      className: string
      children: unknown
    }>

    expect(label).toBe('executed by dag-ml')
    expect(element.type).toBe('span')
    expect(element.props.className).toBe('shared-runtime')
    expect(JSON.stringify(element.props.children)).toContain(label)
  })

  it('keeps shared nirs4all-ui asset exports available to custom hosts', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../vendor/nirs4all-ui/package.json', import.meta.url), 'utf8'),
    ) as { exports?: Record<string, string | { import?: string; types?: string }> }

    expect(packageJson.exports?.['./assets/*']).toBe('./assets/*')
    expect(packageJson.exports?.['./brand']).toMatchObject({ import: './dist/brand/index.js' })
    expect(packageJson.exports?.['./styles']).toMatchObject({ import: './dist/styles/index.js' })
    expect(getNirs4allBrandDefinition('nirs4all-ui').role).toBe('Reusable visual system')
    expect(getNirs4allStyleAsset('default-theme').packageExport)
      .toBe('nirs4all-ui/assets/styles/nirs4all-default.css')
    expect(existsSync(new URL('../../vendor/nirs4all-ui/assets/brand/icon.svg', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../../vendor/nirs4all-ui/assets/brand/horizontal.svg', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../../vendor/nirs4all-ui/assets/brands/nirs4all-core/horizontal.svg', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../../vendor/nirs4all-ui/assets/styles/nirs4all-default.css', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../../vendor/nirs4all-ui/assets/motion/nirs-spectra.svg', import.meta.url))).toBe(true)
  })
})
