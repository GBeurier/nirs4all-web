import type { ReactNode } from "react";
import { type RuntimeEngineLineage } from "../runtime/index.js";
export interface RuntimeEngineBadgeProps {
    lineage?: RuntimeEngineLineage | null;
    label?: string | null;
    icon?: ReactNode;
    className?: string;
    title?: string;
}
export declare function RuntimeEngineBadge({ lineage, label, icon, className, title, }: RuntimeEngineBadgeProps): import("react").JSX.Element | null;
//# sourceMappingURL=RuntimeEngineBadge.d.ts.map