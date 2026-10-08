import { loadArchiveV2Native } from './archive-v2.js';
import { trainingResultView } from './result-view.js';

/** Native WASM constrained variants, including JSON array-valued shapes. */
export async function generate(choices, { strategy = 'cartesian', constraints = {}, count, seed = 0, maxVariants = 10000 } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('seed must be a nonnegative safe integer');
  const native = await loadArchiveV2Native();
  if (typeof native.generate_variants_json !== 'function') throw new Error('Core native variant-generation bridge is unavailable');
  const text = native.generate_variants_json(JSON.stringify({ choices, strategy, constraints, count, seed, max_variants: maxVariants }));
  return JSON.parse(text, function (key, value, context) {
    if (key === 'seed' && typeof value === 'number' && typeof this.variant_id === 'string'
      && /^variant:/.test(this.variant_id) && typeof this.fingerprint === 'string') {
      if (!context?.source) throw new Error('Exact native u64 seeds require a JSON parser with source context');
      return context.source;
    }
    return value;
  });
}

async function nativeCall(cli, operation, record, flags) {
  if (typeof process === 'undefined' || !process.versions?.node) {
    throw new Error('Native HPO currently requires a Node host with the Core CLI; browser generation remains available through WASM');
  }
  const [{ mkdtemp, writeFile, readFile, rm }, { tmpdir }, { join }, { execFile }] = await Promise.all([
    import('node:fs/promises'), import('node:os'), import('node:path'), import('node:child_process'),
  ]);
  const directory = await mkdtemp(join(tmpdir(), 'nirs4all-tuning-'));
  try {
    const input = join(directory, 'input.json'), output = join(directory, 'output.json');
    const args = [operation, '--output', output];
    if (record !== null) { await writeFile(input, JSON.stringify(record)); args.push('--input', input); }
    for (const [name, value] of Object.entries(flags)) if (value !== undefined && value !== null) args.push(`--${name.replaceAll('_', '-')}`, String(value));
    await new Promise((resolve, reject) => execFile(cli, args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(stderr || stdout || error.message)) : resolve()));
    return JSON.parse(await readFile(output, 'utf8'));
  } finally { await rm(directory, { recursive: true, force: true }); }
}

/** Native OOF HPO with a durable N4MOPT checkpoint inside the winner archive. */
export async function tune(data, { trials = 8, seed = 91, sampler = 'random', metric = 'rmse', sourceId = 'spectra',
  checkpoint, methodsLibrary, archive, runId = `run:tuning:${Date.now()}`, cli = globalThis.process?.env?.NIRS4ALL_CORE_CLI ?? 'nirs4all-core-archive' } = {}) {
  if (!Number.isInteger(trials) || trials < 1 || trials > 256) throw new RangeError('trials must be a total budget between 1 and 256');
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('seed must be a nonnegative safe integer');
  if (!methodsLibrary || !archive) throw new TypeError('Native tuning requires methodsLibrary and archive destination');
  const outcome = await nativeCall(cli, 'tuning-run', typeof data?.toJSON === 'function' ? data.toJSON() : data, {
    trials, seed, sampler, metric, source_id: sourceId, checkpoint_archive: checkpoint?.archivePath ?? checkpoint,
    methods_library: methodsLibrary, archive, run_id: runId,
  });
  return new NativeTuningResult(archive, outcome, { trials, seed, sampler, metric, source_id: sourceId }, { methodsLibrary, cli });
}

/** Native Archive V2 model and optimizer state; each prediction runs in a fresh process. */
export class NativeTuningResult {
  constructor(archivePath, outcome, config, runtime = {}) {
    if (!Number.isSafeInteger(config.seed) || config.seed < 0) {
      throw new RangeError('Native tuning seed exceeds the supported exact integer range 0..2^53-1');
    }
    this.archivePath = archivePath; this.outcome = structuredClone(outcome);
    this.config = structuredClone(config); this.runtime = { ...runtime };
  }
  resume(data, options = {}) {
    const c = this.config;
    return tune(data, { ...this.runtime, trials: c.trials, seed: c.seed, sampler: c.sampler,
      metric: c.metric, sourceId: c.source_id, ...options, checkpoint: this.archivePath });
  }
  trials() { return structuredClone(this.outcome.training_outcome.methods_hpo_resume_state.terminal_trials); }
  compare(query = {}) {
    const outcome = this.outcome.training_outcome;
    return trainingResultView(outcome, outcome.effective_plan.campaign.metadata.input_sample_ids).compare(query);
  }
  predictions(query = {}) {
    const outcome = this.outcome.training_outcome;
    return trainingResultView(outcome, outcome.effective_plan.campaign.metadata.input_sample_ids).predictions(query);
  }
  async predict(x, { sampleIds = x.map((_, index) => `predict:${index}`), methodsLibrary = this.runtime.methodsLibrary,
    cli = this.runtime.cli ?? globalThis.process?.env?.NIRS4ALL_CORE_CLI ?? 'nirs4all-core-archive' } = {}) {
    if (!methodsLibrary) throw new TypeError('methodsLibrary is required');
    return nativeCall(cli, 'workflow-predict', { x, sample_ids: sampleIds }, {
      archive: this.archivePath, methods_library: methodsLibrary, run_id: `run:tuning:predict:${Date.now()}`,
    });
  }
  async export(directory) {
    const [fs, { join, dirname }] = await Promise.all([import('node:fs/promises'), import('node:path')]);
    const stage = await fs.mkdtemp(join(dirname(directory), '.nirs4all-tuning-'));
    const owned = [];
    let reservation;
    try {
      await fs.copyFile(this.archivePath, join(stage, 'model.n4a'));
      await fs.writeFile(join(stage, 'tuning.json'), JSON.stringify({ schema: 'nirs4all.tuning.v1', config: this.config,
        training_outcome_fingerprint: this.outcome.training_outcome.outcome_fingerprint, archive_sha256: this.outcome.archive_sha256 }));
      await fs.mkdir(directory);
      reservation = await fs.lstat(directory);
      for (const name of ['model.n4a', 'tuning.json']) {
        const identity = await fs.lstat(join(stage, name));
        await fs.link(join(stage, name), join(directory, name));
        owned.push([join(directory, name), identity]);
      }
      return directory;
    } catch (error) {
      if (reservation) {
        const current = await fs.lstat(directory).catch(() => null);
        if (current?.dev === reservation.dev && current?.ino === reservation.ino) {
          for (const [name, identity] of owned) {
            const entry = await fs.lstat(name).catch(() => null);
            if (entry?.dev === identity.dev && entry?.ino === identity.ino) await fs.unlink(name).catch(() => {});
          }
          await fs.rmdir(directory).catch(() => {});
        }
      }
      throw error;
    } finally {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
}

export async function loadTuning(directory, { cli = globalThis.process?.env?.NIRS4ALL_CORE_CLI ?? 'nirs4all-core-archive', methodsLibrary } = {}) {
  const [{ readFile }, { join }] = await Promise.all([import('node:fs/promises'), import('node:path')]);
  const saved = JSON.parse(await readFile(join(directory, 'tuning.json'), 'utf8'));
  const archive = join(directory, 'model.n4a'), native = await nativeCall(cli, 'tuning-load', null, { archive });
  const same = (left, right) => Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([name, value]) => value === right[name]);
  if (saved.schema !== 'nirs4all.tuning.v1' || saved.archive_sha256 !== native.archive_sha256
    || saved.training_outcome_fingerprint !== native.training_outcome.outcome_fingerprint || !same(saved.config, native.config)) {
    throw new Error('Tuning metadata differs from native archive');
  }
  return new NativeTuningResult(archive, native, native.config, { cli, methodsLibrary });
}
