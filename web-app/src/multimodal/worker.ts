/// <reference lib="webworker" />
import { executeLab } from './execute'
import type { LabWorkerReply, LabWorkerRequest } from './types'

const scope = self as unknown as DedicatedWorkerGlobalScope
scope.onmessage = (event: MessageEvent<LabWorkerRequest>) => {
  const request = event.data
  if (request.kind !== 'run') return
  const send = (reply: LabWorkerReply) => scope.postMessage(reply)
  void executeLab(request.dataset, request.configs, progress => send({ id: request.id, kind: 'progress', progress }))
    .then(result => send({ id: request.id, kind: 'result', result }))
    .catch(reason => {
      const error = reason instanceof Error ? reason : new Error(String(reason))
      send({ id: request.id, kind: 'error', error: { name: error.name, message: error.message } })
    })
}
