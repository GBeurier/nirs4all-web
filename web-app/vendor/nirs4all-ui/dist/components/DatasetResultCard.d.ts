import type { ReactNode } from "react";
export interface DatasetResultCardProps {
    title: string;
    description?: string;
    taskLabel?: string;
    bestScore?: {
        metric: string;
        value: string;
    };
    model?: string;
    sampleCount?: number;
    featureCount?: number;
    tags?: readonly string[];
    status?: string;
    renderTag?: (tag: string) => ReactNode;
    className?: string;
    headerClassName?: string;
    titleClassName?: string;
    descriptionClassName?: string;
    taskClassName?: string;
    scoreClassName?: string;
    modelClassName?: string;
    statListClassName?: string;
    statClassName?: string;
    statLabelClassName?: string;
    statValueClassName?: string;
    tagListClassName?: string;
    tagClassName?: string;
    statusClassName?: string;
    empty?: ReactNode;
}
export declare function DatasetResultCard({ title, description, taskLabel, bestScore, model, sampleCount, featureCount, tags, status, renderTag, className, headerClassName, titleClassName, descriptionClassName, taskClassName, scoreClassName, modelClassName, statListClassName, statClassName, statLabelClassName, statValueClassName, tagListClassName, tagClassName, statusClassName, empty, }: DatasetResultCardProps): import("react").JSX.Element | null;
//# sourceMappingURL=DatasetResultCard.d.ts.map