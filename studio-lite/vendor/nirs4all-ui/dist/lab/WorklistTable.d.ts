import type { ReactNode } from 'react';
import { type SafetyFlag, type WorklistItemInput, type WorklistItemView } from './worklist.js';
import type { Locale } from './locale.js';
export interface WorklistTableProps {
    items?: readonly WorklistItemInput[];
    /** precomputed, already-sorted views (takes precedence) */
    views?: readonly WorklistItemView[] | null;
    /** language for generated labels (default 'fr') */
    locale?: Locale;
    /** host icons keyed by safety flag */
    safetyIcons?: Partial<Record<SafetyFlag, ReactNode>>;
    /** column headers (host-localized); omit to hide the header */
    headers?: {
        rank?: string;
        sampleId?: string;
        barcode?: string;
        reason?: string;
        safety?: string;
    };
    /** render the barcode cell (e.g. a scannable code); default = text */
    renderBarcode?: (barcode: string, item: WorklistItemView) => ReactNode;
    className?: string;
    theadClassName?: string;
    rowClassName?: string;
    cellClassName?: string;
    safetyClassName?: string;
    empty?: ReactNode;
}
/**
 * The HPLC / re-measure worklist table (§3 Écran 3 output) — the bridge to the
 * bench. Presentational; rows come from the pure worklist view-model.
 */
export declare function WorklistTable({ items, views, locale, safetyIcons, headers, renderBarcode, className, theadClassName, rowClassName, cellClassName, safetyClassName, empty, }: WorklistTableProps): import("react").JSX.Element | null;
//# sourceMappingURL=WorklistTable.d.ts.map