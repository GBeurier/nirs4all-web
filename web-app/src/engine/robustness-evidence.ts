import type {
  MaterializedDataset,
  NativeRobustnessEvidencePublicationHandoff,
  RobustnessEvidencePublisher,
  RobustnessEvidencePublicationTrace,
  RobustnessEvidenceRuntimeEvidence,
  RunResult,
} from './types'

function buildRuntimeEvidence(
  ds: MaterializedDataset,
  result: RunResult,
): RobustnessEvidenceRuntimeEvidence {
  return {
    datasetRows: ds.nSamples,
    datasetFeatures: ds.nFeatures,
    refitPredictionCount: result.refit.predictions.length,
    cvPredictionCount: result.cv?.predictions.length ?? 0,
    hasInMemoryModel: Boolean(result.model),
  }
}

export function buildWasmRobustnessEvidencePublicationTrace(
  ds: MaterializedDataset,
  result: RunResult,
  handoff: NativeRobustnessEvidencePublicationHandoff,
): RobustnessEvidencePublicationTrace {
  const publishedFields = [...handoff.publishedFields]
  const runtimeEvidence = buildRuntimeEvidence(ds, result)
  return {
    kind: 'robustness_evidence_publication_trace',
    publisher: 'nirs4all-web.wasm-local',
    status: 'unsupported_runtime',
    requested: handoff.requested,
    destination: handoff.destination,
    failClosed: handoff.failClosed,
    alignmentStrategies: [...handoff.alignmentStrategies],
    publishedFields,
    published: {},
    missing: publishedFields,
    reason: 'wasm_local_has_no_persistent_prediction_array_store',
    runtimeEvidence,
  }
}

function missingPublishedFields(
  publishedFields: string[],
  published: Record<string, unknown>,
  explicitMissing?: string[],
): string[] {
  const missing = new Set(explicitMissing ?? [])
  for (const field of publishedFields) {
    if (!Object.prototype.hasOwnProperty.call(published, field)) missing.add(field)
  }
  return publishedFields.filter((field) => missing.has(field))
}

export async function buildHostSidecarRobustnessEvidencePublicationTrace(
  ds: MaterializedDataset,
  result: RunResult,
  handoff: NativeRobustnessEvidencePublicationHandoff,
  publisher: RobustnessEvidencePublisher,
): Promise<RobustnessEvidencePublicationTrace> {
  const publishedFields = [...handoff.publishedFields]
  const runtimeEvidence = buildRuntimeEvidence(ds, result)
  try {
    const publication = await publisher({
      dataset: ds,
      handoff,
      result,
      runtimeEvidence,
    })
    const published = publication.published ?? {}
    const missing = missingPublishedFields(publishedFields, published, publication.missing)
    return {
      kind: 'robustness_evidence_publication_trace',
      publisher: publication.publisher ?? 'nirs4all-web.host-sidecar',
      status: missing.length === 0 ? 'published' : 'incomplete',
      requested: handoff.requested,
      destination: handoff.destination,
      failClosed: handoff.failClosed,
      alignmentStrategies: [...handoff.alignmentStrategies],
      publishedFields,
      published,
      missing,
      reason: publication.reason,
      runtimeEvidence,
      metadata: publication.metadata,
    }
  } catch (error) {
    return {
      kind: 'robustness_evidence_publication_trace',
      publisher: 'nirs4all-web.host-sidecar',
      status: 'failed',
      requested: handoff.requested,
      destination: handoff.destination,
      failClosed: handoff.failClosed,
      alignmentStrategies: [...handoff.alignmentStrategies],
      publishedFields,
      published: {},
      missing: publishedFields,
      reason: error instanceof Error ? error.message : String(error),
      runtimeEvidence,
    }
  }
}

export async function withWasmRobustnessEvidencePublicationTrace(
  result: RunResult,
  ds: MaterializedDataset,
  handoff: NativeRobustnessEvidencePublicationHandoff | undefined,
  publisher?: RobustnessEvidencePublisher,
): Promise<RunResult> {
  if (!handoff) return result
  const trace = publisher
    ? await buildHostSidecarRobustnessEvidencePublicationTrace(ds, result, handoff, publisher)
    : buildWasmRobustnessEvidencePublicationTrace(ds, result, handoff)
  return {
    ...result,
    robustnessEvidencePublicationTrace: trace,
  }
}
