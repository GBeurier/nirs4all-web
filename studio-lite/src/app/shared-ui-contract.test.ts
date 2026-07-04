import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RuntimeEngineBadge } from 'nirs4all-ui/components'
import { getMetricDefinition, isLowerBetter } from 'nirs4all-ui/score'
import { runtimeEngineLabel } from 'nirs4all-ui/runtime'
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
    const html = renderToStaticMarkup(React.createElement(RuntimeEngineBadge, { lineage, className: 'shared-runtime' }))

    expect(label).toBe('executed by dag-ml')
    expect(html).toContain('class="shared-runtime"')
    expect(html).toContain(label)
  })
})
