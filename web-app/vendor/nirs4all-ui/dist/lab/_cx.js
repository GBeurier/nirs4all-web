// Internal class-name join helper (not exported from the package barrel).
// Mirrors the local `joinClassNames` pattern in MetricValueBadge — keeps the lab
// components free of any external `clsx`/`tailwind-merge` dependency.
export function cx(...parts) {
    const resolved = parts.filter((p) => typeof p === 'string' && p.length > 0);
    return resolved.length > 0 ? resolved.join(' ') : undefined;
}
//# sourceMappingURL=_cx.js.map