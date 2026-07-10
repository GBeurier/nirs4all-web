import type { Locale } from "./roles.js";
import type { PartitionMode, PartitionPreviewModel } from "./types.js";
export interface PartitionPreviewProps {
    preview: PartitionPreviewModel;
    onModeChange?: (mode: PartitionMode) => void;
    locale?: Locale;
    className?: string;
}
/** Train/test/validation/folds counters shown under the central panel. */
export declare function PartitionPreview({ preview, onModeChange, locale, className }: PartitionPreviewProps): import("react").JSX.Element;
//# sourceMappingURL=PartitionPreview.d.ts.map