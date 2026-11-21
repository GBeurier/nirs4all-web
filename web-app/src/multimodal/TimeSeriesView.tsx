import { useMemo } from 'react'
import { SpectraPlot } from 'nirs4all-ui/viz'
import type { LabDataset, LabSource } from './types'

/**
 * One multivariate time series per sample (`series_mv`, time-major `[time, variable]`):
 * one small plot per variable over the declared time axis, the selected sample in red
 * over the min–max envelope of every sample. Display only; values are read as stored.
 * Host view until the shared multimodal package has a time-series view (tracked debt).
 */
export function TimeSeriesView({ dataset, source, index, selectedSampleId }: {
  dataset: LabDataset; source: LabSource; index: number; selectedSampleId: string | null
}) {
  const [steps, variables] = source.shape
  const time = source.axis?.values ?? Array.from({ length: steps }, (_, step) => step)
  const row = selectedSampleId === null ? 0 : Math.max(0, source.sampleIds.indexOf(selectedSampleId))
  const shownId = source.sampleIds[row]
  const panels = useMemo(() => (source.variables ?? source.featureNames).map((name, variable) => {
    const lower = new Array<number>(steps).fill(Infinity), upper = new Array<number>(steps).fill(-Infinity)
    for (let sample = 0; sample < source.sampleIds.length; sample++) {
      for (let step = 0; step < steps; step++) {
        const at = (sample * steps + step) * variables + variable
        if (source.validity && !source.validity[at]) continue
        const value = source.data[at]
        if (value < lower[step]) lower[step] = value
        if (value > upper[step]) upper[step] = value
      }
    }
    const values = Array.from({ length: steps }, (_, step) => {
      const at = (row * steps + step) * variables + variable
      return source.validity && !source.validity[at] ? Number.NaN : source.data[at]
    })
    return { name, lower, upper, values }
  }), [source, steps, variables, row])
  const xLabel = source.axis ? `Time (${source.axis.unit})` : 'Time step'
  // Variable units are declared in the dataset provenance (IO carries names, not units).
  const declared = (dataset.provenance as { declaration?: { variableUnits?: Record<string, Record<string, string>> } }).declaration
  const units = declared?.variableUnits?.[source.id] ?? {}
  return (
    <figure className="n4mm-view">
      <div className="n4mm-view__head">
        <h3 className="n4mm-view__title"><span className="n4mm-tag" data-source={index % 6}>S{index + 1}</span>{source.label}</h3>
        <span className="n4mm-view__meta">Time series · {variables} variables × {steps} steps · {dataset.sampleIds.length} samples</span>
      </div>
      <div className="n4mm-series-grid">
        {panels.map(panel => (
          <SpectraPlot key={panel.name} wavelengths={time} width={440} height={190}
            bands={[{ lower: panel.lower, upper: panel.upper, color: '#0D9488', opacity: 0.18, label: 'all samples (min–max)' }]}
            series={[{ id: shownId, label: shownId, values: panel.values, color: '#E11D48', opacity: 1 }]}
            xLabel={xLabel} yLabel={`${panel.name}${units[panel.name] ? ` (${units[panel.name]})` : ''}`}
            title={`${source.label}: ${panel.name}`}
            description={`${panel.name} of sample ${shownId} over ${steps} time steps, with the min–max envelope of every sample.`} />
        ))}
      </div>
      <figcaption className="n4mm-caption">
        {source.label}: one series of {variables} variables per sample, kept together as one source. Sample {shownId} in red
        {selectedSampleId === null ? ' (first sample; select one above to follow it)' : ''}; the band is the range of every sample.
      </figcaption>
    </figure>
  )
}
