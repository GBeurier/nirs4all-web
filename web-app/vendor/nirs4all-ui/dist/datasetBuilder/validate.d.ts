/**
 * Real-time consistency checks over the current sources.
 *
 * Produces an ordered list of OK / warning / error checks and an overall
 * status. Pure: recompute it on every meaningful change. Text is localized (FR
 * default) but stays terse — the card renders `label` + optional `details`.
 */
import type { Locale } from "./roles.js";
import type { DatasetSource, ValidationResult } from "./types.js";
export declare function validateBuilder(sources: DatasetSource[], locale?: Locale): ValidationResult;
//# sourceMappingURL=validate.d.ts.map