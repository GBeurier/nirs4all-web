import type { ReactNode } from "react";
import { type RuntimeDiagnosticItem } from "../runtime/index.js";
export interface RuntimeDiagnosticListProps {
    source?: unknown;
    diagnostics?: readonly RuntimeDiagnosticItem[] | null;
    className?: string;
    itemClassName?: string | ((item: RuntimeDiagnosticItem) => string | undefined);
    messageClassName?: string;
    metadataClassName?: string;
    empty?: ReactNode;
    renderItem?: (item: RuntimeDiagnosticItem) => ReactNode;
}
export declare function RuntimeDiagnosticList({ source, diagnostics, className, itemClassName, messageClassName, metadataClassName, empty, renderItem, }: RuntimeDiagnosticListProps): import("react").JSX.Element | null;
//# sourceMappingURL=RuntimeDiagnosticList.d.ts.map