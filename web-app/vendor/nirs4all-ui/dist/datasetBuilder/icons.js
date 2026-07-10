import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const base = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
};
export const DEFAULT_ICONS = {
    x: (_jsx("svg", { ...base, children: _jsx("path", { d: "M3 12h3l2-6 4 12 3-8 2 4h4" }) })),
    y: (_jsxs("svg", { ...base, children: [_jsx("circle", { cx: "12", cy: "12", r: "8" }), _jsx("circle", { cx: "12", cy: "12", r: "3" }), _jsx("path", { d: "M12 2v3M12 19v3M2 12h3M19 12h3" })] })),
    metadata: (_jsxs("svg", { ...base, children: [_jsx("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }), _jsx("path", { d: "M3 9h18M9 9v11" })] })),
    id: (_jsxs("svg", { ...base, children: [_jsx("path", { d: "M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" }), _jsx("path", { d: "M9 12l2 2 4-4" })] })),
    partition: (_jsx("svg", { ...base, children: _jsx("path", { d: "M4 12h10M14 12l-3-3M14 12l-3 3M18 5v14" }) })),
    replicate: (_jsxs("svg", { ...base, children: [_jsx("path", { d: "M17 4v6h-6M7 20v-6h6" }), _jsx("path", { d: "M20 10a8 8 0 0 0-14-4M4 14a8 8 0 0 0 14 4" })] })),
    group: (_jsxs("svg", { ...base, children: [_jsx("circle", { cx: "8", cy: "9", r: "3" }), _jsx("circle", { cx: "16", cy: "9", r: "3" }), _jsx("path", { d: "M3 20c0-3 2-5 5-5M21 20c0-3-2-5-5-5" })] })),
    ignored: (_jsxs("svg", { ...base, children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M8 12h8" })] })),
    check: (_jsx("svg", { ...base, children: _jsx("path", { d: "M20 6L9 17l-5-5" }) })),
    warning: (_jsxs("svg", { ...base, children: [_jsx("path", { d: "M12 3l9 16H3z" }), _jsx("path", { d: "M12 10v4M12 17h.01" })] })),
    error: (_jsxs("svg", { ...base, children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M15 9l-6 6M9 9l6 6" })] })),
    chevron: (_jsx("svg", { ...base, children: _jsx("path", { d: "M6 9l6 6 6-6" }) })),
    file: (_jsxs("svg", { ...base, children: [_jsx("path", { d: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" }), _jsx("path", { d: "M14 3v6h6" })] })),
    folder: (_jsx("svg", { ...base, children: _jsx("path", { d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }) })),
    upload: (_jsxs("svg", { ...base, width: 22, height: 22, children: [_jsx("path", { d: "M12 16V4M8 8l4-4 4 4" }), _jsx("path", { d: "M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" })] })),
    info: (_jsxs("svg", { ...base, children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M12 11v5M12 8h.01" })] })),
    eye: (_jsxs("svg", { ...base, children: [_jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] })),
    arrow: (_jsx("svg", { ...base, children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) })),
    spark: (_jsx("svg", { ...base, children: _jsx("path", { d: "M12 3l1.8 4.9L18 9.6l-4.2 1.7L12 16l-1.8-4.7L6 9.6l4.2-1.7z" }) })),
};
export function icon(key, overrides) {
    return overrides?.[key] ?? DEFAULT_ICONS[key] ?? null;
}
//# sourceMappingURL=icons.js.map