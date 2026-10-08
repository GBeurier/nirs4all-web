// Exact SDK snapshot transport with native experiment semantic gates.
import { openExperiment } from './result-view.js';
import { loadArchiveV2Native } from './archive-v2.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
function member(name) {
  if (typeof name !== 'string' || !name || /[\\:]/u.test(name) || name.startsWith('/')
      || name.split('/').some(part => ['', '.', '..'].includes(part))) throw new TypeError('Invalid workspace member path');
}

/** Open exact SDK SQLite/Parquet bytes and native experiments without a DB decoder.
 * The SDK gateway validates relational/Parquet consistency before exporting.
 * Here each native prediction/model closes independently through DAG's gate.
 */
export async function openWorkspace(indexBytes, members) {
  if (!(indexBytes instanceof Uint8Array)) throw new TypeError('Workspace index requires bytes');
  if (indexBytes.length > 1024 * 1024) throw new RangeError('Workspace index exceeds limits');
  const retainedIndex = new Uint8Array(indexBytes);
  const index = JSON.parse(decoder.decode(retainedIndex));
  if (index.schema !== 'nirs4all.workspace.v1' || !Number.isInteger(index.sdk_schema_version)
      || !index.runs || !index.files || !Object.hasOwn(index.files, 'store.sqlite')) throw new TypeError('Unsupported SDK workspace snapshot');
  const native = await loadArchiveV2Native();
  let total = 0;
  const inventory = Object.create(null);
  Object.keys(index.files).forEach(member);
  if (!members || Object.keys(members).length !== Object.keys(index.files).length
      || Object.keys(members).some(name => !Object.hasOwn(index.files, name))) throw new TypeError('Workspace inventory includes unlisted members');
  if (Object.keys(index.files).length > 4096) throw new RangeError('Workspace inventory exceeds limits');
  for (const [path, digest] of Object.entries(index.files)) {
    member(path);
    if (/-wal$|-shm$/u.test(path)) throw new TypeError("Workspace inventory contains an active SQLite journal");
    const value = members[path];
    if (!(value instanceof Uint8Array) || native.sha256_bytes(value) !== digest) throw new TypeError('Workspace member integrity mismatch');
    total += value.length;
    if (total > 1024 * 1024 * 1024) throw new RangeError('Workspace inventory exceeds limits');
    inventory[path] = new Uint8Array(value);
  }
  if (total > 1024 * 1024 * 1024 || Object.keys(index.files).length > 4096) throw new RangeError('Workspace inventory exceeds limits');
  const experiments = new Map();
  for (const [run, record] of Object.entries(index.runs)) {
    member(record.path);
    const prefix = record.path + '/';
    const subset = Object.fromEntries(Object.entries(index.files).filter(([path]) => path.startsWith(prefix))
      .map(([path]) => [path.slice(prefix.length), inventory[path]]));
    const experiment = await openExperiment(subset['experiment.json'], subset);
    if (experiment.runId !== run || typeof record.sdk_run_id !== 'string') throw new TypeError('Workspace native run differs from experiment');
    experiments.set(run, experiment);
  }
  // Snapshot all retained bytes; later mutation of the supplied buffers cannot
  // change an already-validated session's export or predictions.

  let closed = false;
  function requireOpen() { if (closed) throw new Error('Workspace is closed'); }
  return Object.freeze({
    validationLevel: 'hashed_sdk_snapshot_and_native_experiments',
    sdkSchemaVersion: index.sdk_schema_version,
    get closed() { return closed; },
    close() { closed = true; },
    runs() { requireOpen(); return [...experiments].map(([runId, view]) => ({ runId,
      sdkRunId: index.runs[runId].sdk_run_id, winnerVariantId: view.winnerVariantId, variantIds: [...view.variantIds] })); },
    compare(runId, query) { requireOpen(); const view = experiments.get(runId); if (!view) throw new RangeError('Unknown run'); return view.compare(query); },
    predictions(runId, query) { requireOpen(); const view = experiments.get(runId); if (!view) throw new RangeError('Unknown run'); return view.predictions(query); },
    async predictMethods(runId, data, options) { requireOpen(); const view = experiments.get(runId); if (!view) throw new RangeError('Unknown run'); return view.predictMethods(data, options); },
    export() { requireOpen(); return { indexBytes: new Uint8Array(retainedIndex), members: Object.fromEntries(Object.entries(inventory).map(([path, value]) => [path, new Uint8Array(value)])) }; },
  });
}
