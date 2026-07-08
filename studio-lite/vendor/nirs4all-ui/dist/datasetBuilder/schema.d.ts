/**
 * Pure derivations over the current set of sources: the aggregate role schema,
 * the partition preview, and small immutable mutators the container uses to
 * apply role changes without owning any React state itself.
 */
import type { ColumnRef, DatasetColumn, DatasetRole, DatasetSchemaSummary, DatasetSource, PartitionMode, PartitionPreviewModel } from "./types.js";
/** Aggregate every source's column roles into one schema summary. */
export declare function deriveSchema(sources: DatasetSource[]): DatasetSchemaSummary;
/** Count columns by role for the mapping-table help panel + progress bar. */
export declare function countRoles(columns: DatasetColumn[]): {
    total: number;
    assigned: number;
    byRole: Record<DatasetRole, number>;
};
/** Build a partition preview from the first detected partition column. */
export declare function derivePartitionPreview(sources: DatasetSource[], mode?: PartitionMode, approxTotal?: number): PartitionPreviewModel;
export declare function findPartitionColumn(sources: DatasetSource[]): ColumnRef | undefined;
/** Immutably set the role for a set of column ids inside one source. */
export declare function assignRoleToColumns(source: DatasetSource, columnIds: Set<string>, role: DatasetRole): DatasetSource;
/** Immutably toggle a column's selection flag. */
export declare function toggleColumnSelection(source: DatasetSource, columnId: string, selected?: boolean): DatasetSource;
export declare function isRecognizedPartitionValue(value: string): boolean;
//# sourceMappingURL=schema.d.ts.map