import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, Globe, Loader2, RotateCcw, Scale, Search, ShieldCheck } from 'lucide-react'
import type { MaterializedDataset } from '@/engine/types'
import {
  PublicDatasetTargetChoiceRequired,
  downloadPublicDataset,
  loadPublicCatalog,
  formatBytes,
  isAbortError,
  projectPublicDataset,
  publicDatasetName,
  searchPublicDatasets,
  type PublicCatalog,
  type PublicDatasetEntry,
  type PublicDatasetRetained,
  type PublicDatasetSource,
  type PublicImportProgress,
} from '@/data/public-datasets'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Progress } from '@/app/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'
import { cn } from '@/app/components/ui/utils'

export interface PublicDatasetsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** receives the projection; its complete owner record stays reachable via `publicDatasetOf` */
  onDataset: (ds: MaterializedDataset, sourceName: string) => void
  /** another import is running: no new download starts */
  disabled?: boolean
  /** true while original-source files are downloaded, checked or prepared */
  onBusyChange?: (busy: boolean) => void
}

type CatalogState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; catalog: PublicCatalog }
  | { status: 'error'; message: string }

type ImportState =
  | { status: 'idle' }
  | { status: 'running'; progress: PublicImportProgress | null }
  | { status: 'error'; message: string }
  | { status: 'target'; retained: PublicDatasetRetained; options: string[]; message: string }

const resourceSize = (resources: PublicDatasetSource['resources']) => !resources.length ? 'no browser resource'
  : resources.every((r) => r.size_bytes !== null) ? formatBytes(resources.reduce((n, r) => n + r.size_bytes!, 0)) : 'size not declared'
const sourceSize = (d: PublicDatasetEntry) => resourceSize(d.sources.flatMap((s) => s.resources))

function progressLabel(p: PublicImportProgress | null): string {
  if (!p) return 'Connecting…'
  if (p.phase === 'verifying') return 'Checking downloaded files…'
  if (p.phase === 'decoding') return 'Preparing dataset…'
  return p.totalBytes === null ? `Downloading ${formatBytes(p.receivedBytes)}…` : `Downloading ${formatBytes(p.receivedBytes)} of ${formatBytes(p.totalBytes)}…`
}

/** Browse the owner's embedded public catalog and acquire a declared source kit.
 * Original files are downloaded without credentials; Data prepares and IO assembles them.
 * Closing the dialog cancels the download. Source/target choices stay explicit. */
export function PublicDatasetsDialog({ open, onOpenChange, onDataset, disabled, onBusyChange }: PublicDatasetsDialogProps) {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'idle' })
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sourceId, setSourceId] = useState<string | undefined>(undefined)
  const [job, setJob] = useState<ImportState>({ status: 'idle' })
  const catalogAbort = useRef<AbortController | null>(null)
  const importAbort = useRef<AbortController | null>(null)
  const running = job.status === 'running'

  const loadCatalog = useCallback(() => {
    catalogAbort.current?.abort()
    const controller = new AbortController()
    catalogAbort.current = controller
    setCatalog({ status: 'loading' })
    loadPublicCatalog({ signal: controller.signal })
      .then((c) => {
        if (catalogAbort.current === controller) setCatalog({ status: 'ready', catalog: c })
      })
      .catch((e: unknown) => {
        if (catalogAbort.current !== controller) return
        setCatalog(isAbortError(e) ? { status: 'idle' } : { status: 'error', message: e instanceof Error ? e.message : String(e) })
      })
  }, [])

  useEffect(() => {
    if (open && catalog.status === 'idle') loadCatalog()
  }, [open, catalog.status, loadCatalog])

  useEffect(() => {
    onBusyChange?.(running)
  }, [running, onBusyChange])

  // Unmounting cancels whatever is still in flight.
  useEffect(() => () => {
    catalogAbort.current?.abort()
    importAbort.current?.abort()
  }, [])

  const cancelImport = () => {
    importAbort.current?.abort()
    importAbort.current = null
    setJob({ status: 'idle' })
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      cancelImport()
      if (catalog.status === 'loading') {
        catalogAbort.current?.abort()
        catalogAbort.current = null
        setCatalog({ status: 'idle' })
      }
    }
    onOpenChange(next)
  }

  const datasets = catalog.status === 'ready' ? catalog.catalog.datasets : []
  const visible = useMemo(() => searchPublicDatasets(datasets, query), [datasets, query])
  const selected = datasets.find((d) => d.id === selectedId) ?? null
  const effectiveSourceId = selected?.sources.length === 1 ? selected.sources[0].id : sourceId
  const selectedSource = selected?.sources.find((s) => s.id === effectiveSourceId)

  const select = (d: PublicDatasetEntry) => {
    if (running) return
    setSelectedId(d.id)
    setSourceId(undefined)
    setJob({ status: 'idle' })
  }

  const finish = (retained: PublicDatasetRetained, target?: string) => {
    try {
      const ds = projectPublicDataset(retained, target === undefined ? {} : { target })
      setJob({ status: 'idle' })
      onDataset(ds, publicDatasetName(retained.dataset, retained.source))
      onOpenChange(false)
    } catch (e) {
      if (e instanceof PublicDatasetTargetChoiceRequired) setJob({ status: 'target', retained, options: e.options, message: e.message })
      else setJob({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const startImport = () => {
    if (!selected || !selectedSource || selectedSource.status !== 'supported' || disabled || running || catalog.status !== 'ready') return
    const controller = new AbortController()
    importAbort.current = controller
    setJob({ status: 'running', progress: null })
    downloadPublicDataset(catalog.catalog, selected, selectedSource.id, {
      signal: controller.signal,
      onProgress: (progress) => {
        if (importAbort.current === controller) setJob({ status: 'running', progress })
      },
    })
      .then((retained) => {
        if (importAbort.current !== controller) return
        importAbort.current = null
        finish(retained)
      })
      .catch((e: unknown) => {
        if (importAbort.current !== controller) return
        importAbort.current = null
        setJob(isAbortError(e) ? { status: 'idle' } : { status: 'error', message: e instanceof Error ? e.message : String(e) })
      })
  }

  const progress = job.status === 'running' ? job.progress : null
  const percent = progress && progress.totalBytes !== null && progress.totalBytes > 0 ? Math.round((100 * progress.receivedBytes) / progress.totalBytes) : 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" data-public-datasets>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-brand-teal">
              <Globe className="h-4 w-4" />
            </span>
            Public datasets
          </DialogTitle>
          <DialogDescription>
            Download public data from its original publisher, without cookies or credentials.
            Checksums are checked when available. Nothing is uploaded.
          </DialogDescription>
          <p className="text-[11px] text-muted-foreground">
            Catalogued by{' '}
            <a href="https://datasets.nirs4all.org/" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-teal hover:underline">nirs4all-datasets</a>
          </p>
        </DialogHeader>

        {catalog.status === 'loading' && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the public catalog…
          </div>
        )}

        {catalog.status === 'error' && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{catalog.message}</span>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={loadCatalog}>
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        )}

        {catalog.status === 'ready' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search public datasets"
                placeholder="Search by name, id, license or description"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            {datasets.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">The catalog lists no public dataset.</p>
            ) : visible.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No public dataset matches “{query}”.</p>
            ) : (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1" aria-label="Public datasets">
                {visible.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      aria-pressed={d.id === selectedId}
                      disabled={running}
                      onClick={() => select(d)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed',
                        d.id === selectedId ? 'border-brand-teal bg-accent' : 'border-border hover:border-brand-teal/60 hover:bg-accent/40',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{d.name}</span>
                        <code className="font-mono text-[11px] text-muted-foreground">{d.id}</code>
                        <Badge variant="outline" className="gap-1 text-[11px]">
                          <Scale className="h-3 w-3" /> {d.license}
                        </Badge>
                      </div>
                      {d.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.description}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {d.sources.length === 1 ? '1 source' : `${d.sources.length} sources`} · {sourceSize(d)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selected && (
              <div className="space-y-3 rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  License: <span className="font-medium text-foreground">{selected.license}</span> — check its terms before reuse.
                </p>
                {selected.sources.length > 1 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="public-source">Source to import</Label>
                    <Select value={sourceId ?? ''} onValueChange={(v) => { setSourceId(v); setJob({ status: 'idle' }) }} disabled={running}>
                      <SelectTrigger id="public-source" className="w-full">
                        <SelectValue placeholder="Choose a source" />
                      </SelectTrigger>
                      <SelectContent>
                        {selected.sources.map((s) => (
                          <SelectItem key={s.id} value={s.id} disabled={s.status !== 'supported'}>
                            {s.name ?? s.id} · {s.status === 'supported' ? resourceSize(s.resources) : 'unavailable in this browser'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">This dataset has several spectral sources. Only the files declared for the chosen source are downloaded.</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Source: <span className="font-medium text-foreground">{selected.sources[0].name ?? selected.sources[0].id}</span> · {resourceSize(selected.sources[0].resources)}
                  </p>
                )}

                {selected.sources.filter((source) => source.status === 'unsupported').map((source) => (
                  <p key={source.id} className="text-xs text-muted-foreground" role="status">
                    {source.name ?? source.id}: {source.reason}
                  </p>
                ))}

                {job.status === 'running' && (
                  <div className="space-y-1.5" aria-live="polite">
                    <Progress value={progress?.phase === 'downloading' ? percent : 100} />
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progressLabel(progress)}
                    </p>
                  </div>
                )}

                {job.status === 'error' && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{job.message}</span>
                  </div>
                )}

                {job.status === 'target' && (
                  <div className="space-y-1.5 text-xs text-muted-foreground" data-target-choice>
                    <p>Choose the target to display. All targets stay available when you run a pipeline.</p>
                    <div className="flex flex-wrap gap-2">
                      {job.options.map((target) => (
                        <Button key={target} type="button" variant="outline" size="sm" className="h-7" onClick={() => finish(job.retained, target)}>
                          {target}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-green" /> Publisher checksums are checked when available.
          </span>
          <div className="flex gap-2">
            {running ? (
              <Button type="button" variant="outline" onClick={cancelImport}>Cancel download</Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
            )}
            {job.status !== 'target' && (
              <Button
                type="button"
                className="gap-1.5"
                disabled={!selectedSource || selectedSource.status !== 'supported' || disabled || running || catalog.status !== 'ready'}
                onClick={startImport}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : job.status === 'error' ? <RotateCcw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                {job.status === 'error' ? 'Retry import' : 'Download and import'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
