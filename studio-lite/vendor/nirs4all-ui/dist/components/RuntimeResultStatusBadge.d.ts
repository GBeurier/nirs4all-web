import type { ReactNode } from "react";
import { type RuntimeResultStatusIcon, type RuntimeResultStatusView } from "../runtime/index.js";
export interface RuntimeResultStatusBadgeProps {
    status?: string | null;
    progress?: number | null;
    view?: RuntimeResultStatusView | null;
    label?: string | null;
    icon?: ReactNode;
    icons?: Partial<Record<RuntimeResultStatusIcon, ReactNode>>;
    className?: string;
    iconClassName?: string;
    labelClassName?: string;
    progressClassName?: string;
    title?: string;
    showProgress?: boolean;
    formatProgress?: (progress: number) => ReactNode;
}
export declare function RuntimeResultStatusBadge({ status, progress, view, label, icon, icons, className, iconClassName, labelClassName, progressClassName, title, showProgress, formatProgress, }: RuntimeResultStatusBadgeProps): import("react").JSX.Element;
//# sourceMappingURL=RuntimeResultStatusBadge.d.ts.map