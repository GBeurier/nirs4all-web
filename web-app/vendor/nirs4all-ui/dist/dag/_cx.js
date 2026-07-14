// Internal class-name join helper for the `dag` domain (not exported from the
// package barrel). Mirrors the tiny helper used by the viz / lab / datasetBuilder
// domains so the graph view stays free of any external `clsx` dependency.
export function cx(...parts) {
    const resolved = parts.filter((p) => typeof p === "string" && p.length > 0);
    return resolved.length > 0 ? resolved.join(" ") : undefined;
}
//# sourceMappingURL=_cx.js.map