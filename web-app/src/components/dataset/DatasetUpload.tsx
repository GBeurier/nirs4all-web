import { useRef, useState } from 'react'
import { Upload, FileText, FileUp, Loader2, ShieldCheck, Sparkles, AlertTriangle } from 'lucide-react'
import { datasetInputName } from '@/data/dataset'
import { SAMPLES } from '@/data/samples'
import { datasetSpecInputName, ingestFiles, IoIngestionRefusal, resumeIngestion } from '@/data/wasm-io'
import type { DatasetUploadProps } from '@/components/contracts'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/app/components/ui/utils'

/**
 * Drag-and-drop + file-picker ingestion zone. Reads CSV/TXT and vendor files
 * entirely in the browser, assembles them through nirs4all-io (ingestFiles) and
 * hands the dataset up through onDataset(). No bytes ever leave the page.
 */
export function DatasetUpload({ onDataset, onLoadSample, onImportModel, busy: busyProp, error }: DatasetUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const modelRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [busyLocal, setBusyLocal] = useState(false)
  const busy = busyProp || busyLocal

  // The refusal keeps the input bytes, the io analysis and (when io assembled) the original record,
  // so a user decision resumes from the owner evidence instead of re-reading or guessing.
  const [refusal, setRefusal] = useState<IoIngestionRefusal | null>(null)

  const shownError = error ?? localError

  const ingest = async (fileList: FileList | File[]) => {
    setLocalError(null)
    setRefusal(null)
    const files = Array.from(fileList)
    if (files.length === 0) return
    const name = datasetInputName(files)
    setBusyLocal(true)
    try {
      // Every upload — delimited text and vendor formats alike — goes through the
      // nirs4all-formats decode + nirs4all-io inference and assembly (roles, joins,
      // partitions, identity, axis, task type). When io cannot assemble it, the
      // refusal is shown as is; there is no local assembler to fall back on.
      const withBytes = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))
      const { dataset, name: datasetName, analysis } = await ingestFiles(withBytes, name)
      onDataset(dataset, datasetName, analysis)
    } catch (e) {
      if (e instanceof IoIngestionRefusal) setRefusal(e)
      setLocalError(e instanceof Error ? e.message : 'Could not read the selected files.')
    } finally {
      setBusyLocal(false)
    }
  }

  // Resume a refused ingestion with the user's target choice, from the retained owner record.
  const chooseTarget = (target: string) => {
    if (!refusal) return
    try {
      const resumed = resumeIngestion(refusal, { target })
      setRefusal(null)
      setLocalError(null)
      onDataset(resumed.dataset, datasetSpecInputName(resumed.analysis.plan) ?? datasetInputName(refusal.inputs), resumed.analysis)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not use the chosen target.')
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    void ingest(e.dataTransfer.files)
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !busy) inputRef.current?.click()
        }}
        className={cn(
          'group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-colors outline-none',
          busy && 'pointer-events-none opacity-70',
          dragging
            ? 'border-brand-teal bg-accent'
            : 'border-border bg-muted/40 hover:border-brand-teal/60 hover:bg-accent/40',
        )}
      >
        <span
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full transition-colors',
            dragging ? 'bg-brand-teal text-primary-foreground' : 'bg-accent text-brand-teal',
          )}
        >
          {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}
        </span>
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">
            {busy ? 'Reading your dataset…' : 'Drop your spectra here'}
          </p>
          <p className="text-sm text-muted-foreground">
            or <span className="font-medium text-brand-teal">browse</span> — CSV / TXT, or vendor
            formats (SPC, JCAMP, OPUS, ASD, ENVI…)
          </p>
        </div>

        <div className="mt-1 flex flex-col items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-brand-teal" /> or try a sample
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {SAMPLES.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation()
                  onLoadSample(s.id)
                }}
                className="h-auto flex-col items-start gap-0.5 border-brand-teal/30 px-3 py-1.5 text-left hover:bg-brand-teal/5"
              >
                <span className="text-sm font-semibold text-brand-teal">{s.name}</span>
                <span className="text-[11px] font-normal text-muted-foreground">{s.hint}</span>
              </Button>
            ))}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.tsv,.txt,.spc,.dx,.jdx,.jcm,.0,.spa,.spg,.asd,.hdr,.dat,.cdf,.nc,.mat"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void ingest(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {shownError && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{shownError}</span>
        </div>
      )}

      {refusal?.decision && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-target-choice>
          <span>Model which target? (the other columns stay in the retained io record)</span>
          {refusal.decision.target.map((target) => (
            <Button key={target} type="button" variant="outline" size="sm" className="h-7" onClick={() => chooseTarget(target)}>
              {target}
            </Button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-brand-green" />
        <span>Runs entirely in your browser — no files are uploaded.</span>
      </div>

      {onImportModel && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>Already trained a model?</span>
          <input
            ref={modelRef}
            type="file"
            accept=".n4a"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImportModel(f)
              e.target.value = ''
            }}
          />
          <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={() => modelRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5 text-brand-teal" /> Load a saved .n4a model to predict
          </Button>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal" />
        <p className="leading-relaxed">
          Accepted layout:{' '}
          <code className="font-mono text-foreground">X_train.csv</code> +{' '}
          <code className="font-mono text-foreground">y_train.csv</code> (optionally{' '}
          <code className="font-mono text-foreground">X_test.csv</code> /{' '}
          <code className="font-mono text-foreground">y_test.csv</code> and a{' '}
          <code className="font-mono text-foreground">metadata.csv</code>), or a single{' '}
          <code className="font-mono text-foreground">X</code> +{' '}
          <code className="font-mono text-foreground">y</code> pair. nirs4all-io decides the header
          row, the spectral axis and the column roles.
        </p>
      </div>
    </div>
  )
}
