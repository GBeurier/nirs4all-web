// SPDX-License-Identifier: CeCILL-2.1 OR AGPL-3.0-or-later
// Owner-neutral inspection. Scientific payload interpretation is supplied by owners.
import { openN4aContainer } from './n4a.js';

const EMPTY = { fields: [], tables: [] };
const unavailable = (artifact, status, detail) => ({
  ...EMPTY, artifactId: artifact.id, kind: 'document', title: artifact.id, status, detail,
});

/**
 * Open through Core's canonical reader. Preview ports match the declared owner,
 * content type AND version. Nothing is chosen from a member name or extension.
 * The caller owns the source, lifecycle, memory budget and execution isolation.
 */
export async function inspectN4aContainer(source, options = {}) {
  const { previewers = [], ...openOptions } = options;
  const keys = new Set();
  for (const port of previewers) {
    if (typeof port.owner !== 'string' || typeof port.contentType !== 'string'
      || !Number.isSafeInteger(port.version) || port.version < 1 || typeof port.inspect !== 'function') {
      throw new TypeError('An inspection port requires owner, contentType, version and inspect.');
    }
    const key = JSON.stringify([port.owner, port.contentType, port.version]);
    if (keys.has(key)) throw new TypeError(`Duplicate inspection port: ${key}`);
    keys.add(key);
  }
  const container = await openN4aContainer(source, openOptions);
  return new N4aInspectionSession(container, previewers);
}

/** A storage handle plus report-only owner ports. No execution API is exposed. */
export class N4aInspectionSession {
  #container;
  #previewers;
  #pending = new Map();
  #view;
  constructor(container, previewers) {
    this.#container = container;
    this.#previewers = previewers.slice();
    this.#view = container.view();
  }
  get closed() { return this.#container.closed; }
  #live() { if (this.closed) throw new Error('The .n4a inspection is closed.'); }
  /** Exact sizes come from Core's BigInt member ranges, not JSON.parse numbers. */
  report() {
    this.#live();
    const memberByteLengths = Object.fromEntries(this.#view.readability.manifest.members.map(member =>
      [member.path, this.#container.memberStream(member.path).byteLength.toString()]));
    return {
      view: structuredClone(this.#view), byteLength: this.#container.size.toString(),
      memberByteLengths, manifestText: new TextDecoder('utf-8', { fatal: true }).decode(this.#container.manifestBytes()),
    };
  }
  /** Reads only one selected embedded root; owner ports may request its members. */
  async preview(artifactId, options = {}) {
    this.#live();
    if (options.maxRows !== undefined && (!Number.isSafeInteger(options.maxRows) || options.maxRows < 1)) {
      throw new TypeError('Preview maxRows must be a positive integer.');
    }
    const artifact = this.#view.readability.manifest.artifacts.find(item => item.id === artifactId);
    if (!artifact) throw new RangeError(`Unknown .n4a artifact: ${artifactId}`);
    if (artifact.storage.kind === 'reference') return unavailable(artifact, 'unresolved',
      'Reference only: no local payload is embedded. No external resource was fetched.');
    const port = this.#previewers.find(candidate => candidate.owner === artifact.owner
      && candidate.contentType === artifact.content_type.id && candidate.version === artifact.content_type.version);
    if (!port) return unavailable(artifact, 'opaque',
      `No preview port is installed for ${artifact.owner} / ${artifact.content_type.id} @ ${artifact.content_type.version}. Storage metadata remains available.`);
    // Share a pending read, but do not retain decoded datasets after the host discards them.
    const pendingKey = JSON.stringify([artifactId, options.maxRows ?? null]);
    if (this.#pending.has(pendingKey)) return this.#pending.get(pendingKey);
    const pending = (async () => {
      const bytes = await this.#container.readMember(artifact.storage.root_member);
      this.#live();
      const preview = await port.inspect(bytes, structuredClone(artifact), {
        ...options,
        readMember: path => {
          this.#live();
          if (!artifact.storage.member_paths.includes(path)) throw new RangeError('A preview may only read members owned by its artifact.');
          return this.#container.readMember(path);
        },
      });
      this.#live();
      if (!preview || !Array.isArray(preview.fields) || !Array.isArray(preview.tables)) throw new TypeError('The owner returned an invalid inspection preview.');
      return { ...preview, artifactId };
    })();
    this.#pending.set(pendingKey, pending);
    try { return await pending; } finally { this.#pending.delete(pendingKey); }
  }
  close() { this.#pending.clear(); this.#container.close(); }
}
