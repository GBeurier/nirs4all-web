import type { ReactNode } from "react";
import { type BuilderIconKey } from "./icons.js";
import { type Locale } from "./roles.js";
import type { DatasetSource } from "./types.js";
export interface SourceSummaryCardProps {
    source: DatasetSource;
    sources?: DatasetSource[];
    onChangeSource?: (sourceId: string) => void;
    locale?: Locale;
    icons?: Partial<Record<BuilderIconKey, ReactNode>> | undefined;
    className?: string;
}
/** The active-source card: icon, name, row/column counts, size and status. */
export declare function SourceSummaryCard({ source, sources, onChangeSource, locale, icons, className, }: SourceSummaryCardProps): import("react").JSX.Element;
//# sourceMappingURL=SourceSummaryCard.d.ts.map