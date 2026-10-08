// Native CPU pipeline transport for Node hosts. Methods and DAG own all numerics.
async function invoke(operation, record, options, flags = {}) {
  if (typeof process === 'undefined' || !process.versions?.node) {
    throw new Error('Catalog-native CPU pipelines require a Node native CLI host');
  }
  const [{ mkdtemp, writeFile, readFile, rm }, { tmpdir }, path, { promisify }, { execFile }] = await Promise.all([
    import('node:fs/promises'), import('node:os'), import('node:path'), import('node:util'), import('node:child_process'),
  ]);
  const directory = await mkdtemp(path.join(tmpdir(), 'nirs4all-pipeline-'));
  try {
    const input = path.join(directory, 'input.json'), output = path.join(directory, 'output.json');
    await writeFile(input, typeof record === 'string' ? record : JSON.stringify(record), { flag: 'wx' });
    const args = [operation, '--input', input, '--output', output];
    for (const [key, value] of Object.entries(flags)) if (value !== undefined) args.push('--' + key.replaceAll('_', '-'), String(value));
    await promisify(execFile)(options.cli ?? process.env.NIRS4ALL_CORE_CLI ?? 'nirs4all-core-archive', args, { maxBuffer: 4 * 1024 * 1024 });
    return await readFile(output, 'utf8');
  } finally { await rm(directory, { recursive: true, force: true }); }
}
function library(options) {
  const value = options.methodsLibrary ?? globalThis.process?.env?.N4M_LIBRARY_PATH ?? globalThis.process?.env?.N4M_LIB_PATH;
  if (!value) throw new TypeError('methodsLibrary or N4M_LIBRARY_PATH is required');
  return value;
}
export class NativeMultimodal {
  #nativeJson; #options;
  constructor(nativeJson, options = {}) { this.#nativeJson = nativeJson; this.#options = { cli: options.cli, methodsLibrary: options.methodsLibrary }; }
  get config() { return JSON.parse(this.#nativeJson).config; }
  get outcomes() { return JSON.parse(this.#nativeJson).target_models.map(entry => entry.model.training_outcome); }
  toNativeJSON() { return this.#nativeJson; }
  async predict(value, options = {}) {
    const merged = { ...this.#options, ...options };
    const io = options.io ?? await import('@nirs4all/io-wasm/public-dataset');
    const record = io.dataset(typeof value?.toJSON === 'function' ? value.toJSON() : value).toJSON();
    const payload = `{"model":${this.#nativeJson},"dataset":${JSON.stringify(record)}}`;
    return JSON.parse(await invoke('native-multimodal-predict', payload, merged, {
      methods_library: library(merged), run_id: options.runId ?? `run:multimodal:predict:${crypto.randomUUID()}`,
    }));
  }
  async export(path) { await invoke('native-multimodal-export', this.#nativeJson, this.#options, { destination: path }); return path; }
  async retrain(value, options = {}) {
    const merged = { ...this.#options, ...options };
    const io = options.io ?? await import('@nirs4all/io-wasm/public-dataset');
    const record = io.dataset(typeof value?.toJSON === 'function' ? value.toJSON() : value).toJSON();
    const payload = `{"model":${this.#nativeJson},"dataset":${JSON.stringify(record)}}`;
    const native = await invoke('native-multimodal-retrain', payload, merged, {
      methods_library: library(merged), run_id: options.runId ?? `run:retrain:${crypto.randomUUID()}`,
    });
    return new NativeMultimodal(native, merged);
  }
  static async load(nativeJson, options = {}) {
    if (typeof nativeJson !== 'string') throw new TypeError('Native multimodal load requires exact native JSON text');
    return new NativeMultimodal(await invoke('native-multimodal-load', nativeJson, options), options);
  }
}
export async function runMultimodal(value, pipeline, sourcePolicies, options = {}) {
  const io = options.io ?? await import('@nirs4all/io-wasm/public-dataset');
  const record = io.dataset(typeof value?.toJSON === 'function' ? value.toJSON() : value).toJSON();
  const native = await invoke('native-multimodal-run', { dataset: record, pipeline, source_policies: sourcePolicies }, options, {
    methods_library: library(options), run_id: options.runId ?? `run:multimodal:${crypto.randomUUID()}`,
  });
  return new NativeMultimodal(native, options);
}
