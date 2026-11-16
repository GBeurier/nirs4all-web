import { useCallback, useRef, useState } from 'react'
import { MultimodalDatasetBuilder, type MultimodalBuilderDraft, type MultimodalBuilderValidation } from 'nirs4all-ui/datasetBuilder'
import { inspectBuilderFiles, validateBuilderDraft, type InspectedBuilderFiles } from './builder-data'
import type { LabCase, LabDataset } from './types'

/** Browser-only host for the shared presentation component. A draft never replaces active data before explicit creation. */
export function DatasetBuilderHost({ caseId, disabled, onCreate }: {
  caseId: LabCase; disabled: boolean; onCreate: (dataset: LabDataset, fileNames: string[]) => void
}) {
  const [files, setFiles] = useState<readonly File[]>([])
  const [inspected, setInspected] = useState<InspectedBuilderFiles | null>(null)
  const [draft, setDraft] = useState<MultimodalBuilderDraft>({ name: `${caseId}-dataset`, sources: [] })
  const [validation, setValidation] = useState<MultimodalBuilderValidation>({ status: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const revision = useRef(0)
  const accepted = useRef<{ revision: number; dataset: LabDataset } | null>(null)
  const invalidate = useCallback(() => {
    revision.current += 1; accepted.current = null; setValidation({ status: 'idle' }); setError(null)
    return revision.current
  }, [])
  const inspect = useCallback(async (nextFiles: readonly File[], previous?: MultimodalBuilderDraft) => {
    const token = invalidate(); setBusy(true)
    try {
      const next = await inspectBuilderFiles(nextFiles, caseId, previous)
      if (token !== revision.current) return
      setFiles(nextFiles); setInspected(next); setDraft(next.draft)
    } catch (reason) {
      if (token === revision.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally { if (token === revision.current) setBusy(false) }
  }, [caseId, invalidate])
  const addFiles = useCallback((added: readonly File[]) => {
    // Re-selecting a filename explicitly replaces that file, preserving every other source.
    const replacing = new Set(added.map(file => file.name))
    const next = [...files.filter(file => !replacing.has(file.name)), ...added]
    void inspect(next, added.some(file => file.name === 'manifest.json') ? undefined : draft)
  }, [files, draft, inspect])
  const updateDraft = useCallback((next: MultimodalBuilderDraft) => {
    const activated = next.sources.some(source => source.role !== 'ignored' &&
      draft.sources.find(previous => previous.id === source.id)?.role === 'ignored' && source.columns.length === 0)
    if (activated) { void inspect(files, next); return }
    invalidate(); setDraft(next)
  }, [draft, files, inspect, invalidate])
  const validate = useCallback(async () => {
    if (!inspected) return
    const token = invalidate(); setValidation({ status: 'checking' }); setBusy(true)
    try {
      const result = await validateBuilderDraft(draft, inspected.inputs, caseId, inspected.provenance)
      if (token !== revision.current) return
      accepted.current = result.dataset ? { revision: token, dataset: result.dataset } : null
      setValidation(result.validation)
    } catch (reason) {
      if (token === revision.current) setValidation({ status: 'error', message: reason instanceof Error ? reason.message : String(reason) })
    } finally { if (token === revision.current) setBusy(false) }
  }, [draft, inspected, caseId, invalidate])
  const create = useCallback(() => {
    if (disabled || busy || validation.status !== 'valid' || accepted.current?.revision !== revision.current) return
    onCreate(accepted.current.dataset, files.map(file => file.name))
  }, [disabled, busy, validation.status, files, onCreate])
  return <MultimodalDatasetBuilder files={inspected?.inventory ?? []} draft={draft} onDraftChange={updateDraft}
    onAddFiles={addFiles} onRemoveFile={name => { void inspect(files.filter(file => file.name !== name), draft) }}
    validation={validation} onValidate={() => { void validate() }} onCreate={create}
    busy={busy} disabled={disabled} error={error} />
}
