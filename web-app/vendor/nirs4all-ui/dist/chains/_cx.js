// Internal class-name join helper for the `chains` domain (not part of the
// public barrel). Mirrors the same tiny helper used by the viz/lab/dag
// components so the explorer stays free of any external `clsx` dependency.
export function cx(...parts) {
    const resolved = parts.filter((p) => typeof p === "string" && p.length > 0);
    return resolved.length > 0 ? resolved.join(" ") : undefined;
}
//# sourceMappingURL=_cx.js.map