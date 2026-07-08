// Internal class-name join helper (not exported from the package barrel).
export function cx(...parts) {
    const resolved = parts.filter((p) => typeof p === "string" && p.length > 0);
    return resolved.length > 0 ? resolved.join(" ") : undefined;
}
//# sourceMappingURL=_cx.js.map