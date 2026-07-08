/**
 * Stable, colour-coded metadata for every dataset role and signal type.
 *
 * Colours are exposed as design tokens (a stable `token` key + a CSS custom
 * property name) so hosts can theme them, while the shipped stylesheet gives a
 * working default that matches the product mock (X=blue, Y=red, metadata=green,
 * ID=amber, partition=grey, replicate=violet, group=cyan).
 */
import type { DatasetRole, SignalType } from "./types.js";
export type Locale = "fr" | "en";
export interface RoleDescriptor {
    role: DatasetRole;
    /** stable colour token, used as `data-role` and to pick CSS variables. */
    token: string;
    labels: Record<Locale, string>;
    hints: Record<Locale, string>;
    /** short one-liner shown under the role name on the big role cards. */
    descriptions: Record<Locale, string>;
}
export declare const ROLE_ORDER: DatasetRole[];
export declare const ROLE_DESCRIPTORS: Record<DatasetRole, RoleDescriptor>;
export declare function roleLabel(role: DatasetRole, locale?: Locale): string;
export declare function roleToken(role: DatasetRole): string;
export interface SignalTypeOption {
    value: SignalType;
    labels: Record<Locale, string>;
}
export declare const SIGNAL_TYPES: SignalTypeOption[];
export declare function signalTypeLabel(signal: SignalType, locale?: Locale): string;
//# sourceMappingURL=roles.d.ts.map