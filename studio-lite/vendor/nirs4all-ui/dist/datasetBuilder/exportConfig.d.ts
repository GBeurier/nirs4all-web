/**
 * Serialize the wizard state into the reusable nirs4all dataset config JSON.
 *
 * Mirrors the documented export shape (sources / targets / metadata / joins /
 * partition / replicates). Pure — the container calls this on "create".
 */
import type { DatasetExportConfig, DatasetSource } from "./types.js";
export declare function buildExportConfig(name: string, sources: DatasetSource[]): DatasetExportConfig;
//# sourceMappingURL=exportConfig.d.ts.map