import type { ReactNode } from "react";
import { type BuilderIconKey } from "./icons.js";
import { type Locale } from "./roles.js";
import type { DatasetRole } from "./types.js";
export interface RoleSelectionCardsProps {
    /** columns currently selected in the mapping table (drives the apply hint). */
    selectedCount?: number;
    activeRole?: DatasetRole | null;
    onAssignRole: (role: DatasetRole) => void;
    /** roles to show; defaults to the 6 primary roles from the spec. */
    roles?: DatasetRole[];
    locale?: Locale;
    icons?: Partial<Record<BuilderIconKey, ReactNode>> | undefined;
    className?: string;
}
/** The big clickable role cards; clicking applies the role to the selection. */
export declare function RoleSelectionCards({ selectedCount, activeRole, onAssignRole, roles, locale, icons, className, }: RoleSelectionCardsProps): import("react").JSX.Element;
//# sourceMappingURL=RoleSelectionCards.d.ts.map