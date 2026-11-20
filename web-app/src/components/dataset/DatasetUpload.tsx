import { useRef, useState } from 'react'
import { Upload, FileText, FileUp, Globe, Loader2, ShieldCheck, Sparkles, AlertTriangle } from 'lucide-react'
import { datasetInputName } from '@/data/dataset'
import { SAMPLES } from '@/data/samples'
import { ingestFiles } from '@/data/wasm-io'
import type { DatasetUploadProps } from '@/components/contracts'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/app/components/ui/utils'
import { PublicDatasetsDialog } from './PublicDatasetsDialog'

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
  const [publicOpen, setPublicOpen] = useState(false)
  const [busyPublic, setBusyPublic] = useState(false)
  const busy = busyProp || busyLocal || busyPublic

  const shownError = error ?? localError

  const ingest = async (fileList: FileList | File[]) => {
    setLocalError(null)
    const files = Array.from(fileList)
    if (files.length === 0) return
    const name = datasetInputName(files)
    setBusyLocal(true)
    try {
      // Every upload — delimited text and vendor formats alike — goes through the
      // nirs4all-formats decode + nirs4all-io inference and assembly (roles, joins,
      // partitions, identity, axis, task type). A dataset with several targets or missing
      // values loads as it is: every target and every missing cell io reports is kept, and
      // the target to model is chosen when a run is launched. When io cannot assemble the
      // files, the refusal is shown as is; there is no local assembler to fall back on.
      const withBytes = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))
      const { dataset, name: datasetName, analysis } = await ingestFiles(withBytes, name)
      onDataset(dataset, datasetName, analysis)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not read the selected files.')
    } finally {
      setBusyLocal(false)
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation()
              setPublicOpen(true)
            }}
            // Enter/Space activate this button only, never the drop zone's file picker as well
            onKeyDown={(e) => e.stopPropagation()}
            className="h-7 gap-1.5 text-xs text-brand-teal"
          >
            <Globe className="h-3.5 w-3.5" /> Browse public datasets
          </Button>
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

      <PublicDatasetsDialog
        open={publicOpen}
        onOpenChange={setPublicOpen}
        disabled={busyProp || busyLocal}
        onBusyChange={setBusyPublic}
        onDataset={(ds, name) => {
          setLocalError(null)
          onDataset(ds, name)
        }}
      />

      {shownError && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{shownError}</span>
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
          row, the spectral axis and the column roles. Several target columns and missing values
          (empty, <code className="font-mono text-foreground">NA</code>,{' '}
          <code className="font-mono text-foreground">NaN</code>) are kept as they are: you choose the
          target and how missing values are handled when you run a pipeline.
        </p>
      </div>
    </div>
  )
}
