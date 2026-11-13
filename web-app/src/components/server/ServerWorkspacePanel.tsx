import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ServerClient, ServerError, type Principal, type WorkspaceRecord } from '@nirs4all/server-client'
import { Button } from '@/app/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import { engine } from '@/engine/client'
import { trainingRowSteps } from '@/engine/orchestrate'
import {
  createWebWorkspaceArchive, loadWebWorkspace, WEB_WORKSPACE, webWorkspaceSnapshot,
  type RestoredWebWorkspace, type WebWorkspaceInput,
} from '@/lib/serverWorkspace'

interface Props {
  input: WebWorkspaceInput
  onRestore: (state: RestoredWebWorkspace) => void
  onDisconnect: () => void
}
interface Connection { client: ServerClient; principal: Principal | null; generation: number }

/** Optional network surface. The client and its credential never enter host persistence. */
export function ServerWorkspacePanel({ input, onRestore, onDisconnect }: Props) {
  const [open, setOpen] = useState(false)
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [pending, setPending] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [message, setMessage] = useState('')
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [active, setActive] = useState<WorkspaceRecord | null>(null)
  const [workspaceId, setWorkspaceId] = useState('')
  const [name, setName] = useState('Web workspace')
  const [includeDataset, setIncludeDataset] = useState(false)
  const [includeModel, setIncludeModel] = useState(false)
  const [allowTrainingRows, setAllowTrainingRows] = useState(false)
  const [conflictId, setConflictId] = useState<string | null>(null)
  const connection = useRef<Connection | null>(null)
  const generation = useRef(0)
  const connectForm = useRef<HTMLFormElement>(null)
  const offline = typeof location !== 'undefined' && location.protocol === 'file:'
  const current = (value: Connection) => connection.current === value && generation.current === value.generation

  useEffect(() => () => {
    generation.current++
    connection.current?.client.disconnect()
    connection.current = null
    onDisconnect()
  }, [])

  useEffect(() => {
    setIncludeDataset(false)
    setIncludeModel(false)
    setAllowTrainingRows(false)
  }, [input.dataset, input.selectedRun, input.loadedModel])

  const disconnect = () => {
    generation.current++
    connection.current?.client.disconnect()
    connection.current = null
    onDisconnect()
    const tokenField = connectForm.current?.elements.namedItem('serverToken') as HTMLInputElement | null
    if (tokenField) tokenField.value = ''
    setPrincipal(null)
    setPending(false)
    setConnecting(false)
    setWorkspaces([])
    setCursor(null)
    setActive(null)
    setWorkspaceId('')
    setConflictId(null)
    setIncludeDataset(false)
    setIncludeModel(false)
    setAllowTrainingRows(false)
    setMessage('Disconnected. Local work is unchanged.')
  }

  const errorMessage = (error: unknown) => error instanceof ServerError
    ? `Server request refused (${error.status || 'network'}; ${error.code}). Local work was kept.`
    : 'Workspace action failed or the archive/profile is unsupported. Local work was kept.'

  const refresh = async (value: Connection, next?: string) => {
    const page = await value.client.listWorkspaces(next ? { cursor: next } : undefined)
    if (!current(value)) return
    const items = page.items.filter((record) => record.snapshot.metadata.app === WEB_WORKSPACE.app)
    setWorkspaces((previous) => next ? [...previous, ...items] : items)
    setCursor(page.next_cursor)
  }

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const tokenField = form.elements.namedItem('serverToken') as HTMLInputElement
    const token = tokenField.value
    tokenField.value = '' // Clear before construction, fetch or await.
    if (offline) { setMessage('Server connection requires the served app and an allowed browser origin. Local/offline tools remain available.'); return }
    disconnect()
    let value: Connection | null = null
    try {
      const baseUrl = (form.elements.namedItem('serverUrl') as HTMLInputElement).value
      const client = new ServerClient(baseUrl, { token, timeoutMs: 3_600_000 })
      value = { client, principal: null, generation: generation.current }
      connection.current = value
      setConnecting(true)
      setPending(true)
      setMessage('Verifying the server project…')
      const verified = await client.principal()
      if (!current(value)) return
      value.principal = verified
      setPrincipal(verified)
      setMessage('Connected. No dataset or model has been uploaded.')
      await refresh(value)
    } catch (error) {
      if (value && !current(value)) return
      value?.client.disconnect()
      connection.current = null
      setPrincipal(null)
      setMessage(errorMessage(error))
    } finally {
      if (!value || current(value) || connection.current === null && generation.current === value.generation) {
        setConnecting(false)
        setPending(false)
      }
    }
  }

  const run = async (action: (value: Connection) => Promise<void>) => {
    const value = connection.current
    if (!value?.principal || pending) return
    setPending(true)
    setMessage('Working…')
    try { await action(value) }
    catch (error) {
      if (current(value)) setMessage(errorMessage(error))
    } finally {
      if (current(value)) setPending(false)
    }
  }

  const openWorkspace = (id: string) => run(async (value) => {
    const restored = await loadWebWorkspace(value.client, id)
    if (!current(value)) return
    if (!window.confirm(`Replace the current local dataset, pipeline, results and imported model with “${restored.record.snapshot.name}”? No analysis will run automatically.`)) {
      setMessage('Open cancelled. Local work was kept.')
      return
    }
    if (!current(value)) return
    onRestore(restored.state)
    setActive(restored.record)
    setWorkspaceId(restored.record.workspace_id)
    setName(restored.record.snapshot.name)
    setConflictId(null)
    setMessage(`Opened revision ${restored.record.revision}. Review the restored state before running any analysis.`)
  })

  const save = (asNew = false) => run(async (value) => {
    const id = asNew || !workspaceId.trim() ? crypto.randomUUID() : workspaceId.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
      setMessage('Use a workspace ID with letters, digits, underscores or hyphens, starting with a letter or digit (up to 128 characters). Nothing was uploaded.')
      return
    }
    const revision = !asNew && active?.workspace_id === id ? active.revision : 0
    const archive = await createWebWorkspaceArchive(input, { includeDataset, includeModel, allowTrainingRows }, engine)
    if (!current(value)) return
    const artifact = await value.client.upload(archive, { filename: 'web-workspace.n4a' })
    if (!current(value)) return
    try {
      const saved = await value.client.saveWorkspace(id, webWorkspaceSnapshot(name.trim() || 'Web workspace', artifact.sha256), { expectedRevision: revision })
      if (!current(value)) return
      setActive(saved)
      setWorkspaceId(saved.workspace_id)
      setConflictId(null)
      setMessage(`Saved revision ${saved.revision}.`)
      await refresh(value)
    } catch (error) {
      if (!current(value)) return
      if (error instanceof ServerError && error.status === 409) {
        setConflictId(id)
        setMessage('Revision conflict. Local work was kept. Reload the server workspace or save as a new workspace; nothing was overwritten.')
        return
      }
      throw error
    }
  })

  const trainingSteps = input.selectedRun ? trainingRowSteps(input.selectedRun.model) : []
  const importedModel = !input.selectedRun && !!input.loadedModel
  const modelAvailable = !!input.selectedRun || !!input.loadedModelArchive && input.loadedModelArchive.model === input.loadedModel
  const modelConsentRequired = includeModel && (trainingSteps.length > 0 || importedModel)
  const canSave = principal?.rights.includes('server.add') && (!modelConsentRequired || allowTrainingRows)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm" data-server-workspaces>Server workspaces</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-server-workspace-panel>
        <DialogHeader>
          <DialogTitle>Server workspaces</DialogTitle>
          <DialogDescription>Optional private project storage. Computation stays in this browser. The token stays in memory until disconnect or page close.</DialogDescription>
        </DialogHeader>
        {!principal && (
          <form ref={connectForm} onSubmit={(event) => { void connect(event) }} className="space-y-3" autoComplete="off">
            <label className="block text-sm">Server URL<Input name="serverUrl" type="url" placeholder="https://server.example.org" required disabled={pending} autoComplete="off" /></label>
            <label className="block text-sm">Project token<Input name="serverToken" type="password" required disabled={pending} autoComplete="off" spellCheck={false} /></label>
            {offline && <p className="text-sm text-muted-foreground">Server connection is unavailable from file://. Use the served app with an allowed origin; the local app remains available.</p>}
            <Button type="submit" disabled={pending || offline}>Connect</Button>
          </form>
        )}
        {(principal || connecting) && <Button type="button" variant="outline" onClick={disconnect}>Disconnect and abort requests</Button>}
        {principal && (
          <>
            <div className="rounded-lg border p-3 text-sm" data-server-principal>
              <p>Verified project: <strong>{principal.project_id}</strong></p>
              <p>Rights: {principal.rights.join(', ') || 'none'}</p>
              <p>Services: {principal.services.join(', ') || 'none'}</p>
            </div>
            {input.dataset && <p className="text-sm" data-server-local-summary data-sample-count={input.dataset.nSamples} data-feature-count={input.dataset.nFeatures} data-first-sample-id={input.dataset.sampleIds[0]}>
              Local dataset: {input.dataset.nSamples} samples × {input.dataset.nFeatures} features. First sample: {input.dataset.sampleIds[0]}.
            </p>}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Project workspaces</h3><Button variant="outline" size="sm" disabled={pending} onClick={() => { void run(async (value) => { await refresh(value); if (current(value)) setMessage('Workspace list refreshed.') }) }}>Refresh</Button></div>
              {workspaces.length === 0 && <p className="text-sm text-muted-foreground">No Web workspaces in this page.</p>}
              <ul className="space-y-1" aria-label="Project Web workspaces">
                {workspaces.map((record) => <li key={record.workspace_id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm"><span>{record.snapshot.name} · revision {record.revision}</span><Button variant="outline" size="sm" disabled={pending} onClick={() => { void openWorkspace(record.workspace_id) }}>Open {record.snapshot.name}</Button></li>)}
              </ul>
              {cursor && <Button variant="outline" disabled={pending} onClick={() => { void run((value) => refresh(value, cursor)) }}>Load more workspaces</Button>}
            </div>
            <div className="space-y-3 border-t pt-3">
              <label className="block text-sm">Workspace name<Input value={name} onChange={(event) => setName(event.target.value)} disabled={pending} /></label>
              <label className="block text-sm">Workspace ID<Input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} placeholder="New workspace ID generated on save" disabled={pending} /></label>
              {active && <p className="text-sm">Opened/saved revision: {active.revision}</p>}
              <p className="text-sm text-muted-foreground">Save transfers the exact pipeline/editor state in a Core .n4a attachment. Select additional private content explicitly:</p>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={includeDataset} onChange={(event) => setIncludeDataset(event.target.checked)} disabled={pending || !input.dataset} className="mt-1" />I consent to upload the dataset, all retained IO records, identities, metadata, provenance and original source file bytes.</label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={includeModel} onChange={(event) => { setIncludeModel(event.target.checked); setAllowTrainingRows(false) }} disabled={pending || !modelAvailable} className="mt-1" />I consent to upload the {input.selectedRun ? 'selected completed run’s fitted model' : 'original owner-imported model archive'}.</label>
              {!modelAvailable && input.loadedModel && <p className="text-sm text-muted-foreground">The restored browser session has no original model bytes. Import the .n4a file again to include that model.</p>}
              {modelConsentRequired && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allowTrainingRows} onChange={(event) => setAllowTrainingRows(event.target.checked)} disabled={pending} className="mt-1" />{importedModel ? 'I explicitly consent to upload the original model archive and any training rows, source files or dataset it contains.' : `I explicitly consent to share training rows embedded in: ${trainingSteps.join(', ')}.`}</label>}
              {!principal.rights.includes('server.add') && <p className="text-sm text-muted-foreground">This token can browse but cannot save workspaces (server.add required).</p>}
              <div className="flex flex-wrap gap-2"><Button disabled={pending || !canSave} onClick={() => { void save() }}>Save workspace</Button><Button variant="outline" disabled={pending || !canSave} onClick={() => { void save(true) }}>Save as new workspace</Button></div>
              {conflictId && <Button variant="outline" disabled={pending} onClick={() => { void openWorkspace(conflictId) }}>Reload server workspace</Button>}
            </div>
          </>
        )}
        <p role="status" aria-live="polite" className="text-sm" data-server-workspace-status>{message}</p>
      </DialogContent>
    </Dialog>
  )
}
