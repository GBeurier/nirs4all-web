import type { ReactNode } from "react";
import { type DatasetPreviewBadge, type DatasetPreviewInput, type DatasetPreviewStat, type DatasetPreviewView } from "../dataset/index.js";
export interface DatasetPreviewCardProps {
    dataset?: DatasetPreviewInput | null;
    view?: DatasetPreviewView | null;
    className?: string;
    headerClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
    badgeListClassName?: string;
    badgeClassName?: string | ((badge: DatasetPreviewBadge) => string | undefined);
    statListClassName?: string;
    statClassName?: string | ((stat: DatasetPreviewStat) => string | undefined);
    statLabelClassName?: string;
    statValueClassName?: string;
    statDetailClassName?: string;
    empty?: ReactNode;
    renderBadge?: (badge: DatasetPreviewBadge) => ReactNode;
    renderStat?: (stat: DatasetPreviewStat) => ReactNode;
}
export declare function DatasetPreviewCard({ dataset, view, className, headerClassName, titleClassName, descriptionClassName, badgeListClassName, badgeClassName, statListClassName, statClassName, statLabelClassName, statValueClassName, statDetailClassName, empty, renderBadge, renderStat, }: DatasetPreviewCardProps): import("react").JSX.Element | null;
//# sourceMappingURL=DatasetPreviewCard.d.ts.map