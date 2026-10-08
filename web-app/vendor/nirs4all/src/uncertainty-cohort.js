// IO owns normalization and relations; this wrapper enforces the public bound.
export function independentPhysicalDataset(io, value) {
  const record = io.dataset(value).toJSON();
  const raw = record.dataset;
  if (raw.groups !== null
    || record.origin_ids.some((origin, row) => origin !== raw.sample_ids[row])
    || Object.hasOwn(raw, 'independent_unit_ids')
    || Object.hasOwn(raw, 'repetition_ids')) {
    throw new TypeError('Uncertainty requires independent physical samples without groups, origin aliases or declared experimental units/repetitions');
  }
  return record;
}
