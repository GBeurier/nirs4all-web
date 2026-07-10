/**
 * Serialize the wizard state into the reusable nirs4all dataset config JSON.
 *
 * Mirrors the documented export shape (sources / targets / metadata / joins /
 * partition / replicates). Pure — the container calls this on "create".
 */
function columnNames(columns, role) {
    return columns.filter((c) => c.assignedRole === role).map((c) => c.name);
}
function firstColumn(columns, role) {
    return columns.find((c) => c.assignedRole === role);
}
function semanticToTask(col) {
    if (col.semanticType === "classification" || col.semanticType === "categorical") {
        return "classification";
    }
    if (col.semanticType === "regression")
        return "regression";
    return col.detectedType === "text" || col.detectedType === "boolean"
        ? "classification"
        : "regression";
}
/** Collapse a long list of x columns to head…tail so the config stays readable. */
function summarizeXColumns(names) {
    if (names.length <= 6)
        return names;
    return [names[0], names[1], "...", names[names.length - 2], names[names.length - 1]];
}
export function buildExportConfig(name, sources) {
    const exportSources = [];
    const targets = [];
    const metadata = [];
    for (const source of sources) {
        const idCol = firstColumn(source.columns, "id");
        const repCol = firstColumn(source.columns, "replicate");
        const partCol = firstColumn(source.columns, "partition");
        const xNames = columnNames(source.columns, "x");
        exportSources.push({
            name: source.name,
            signal_type: source.signalType,
            use_as: source.usage.useAs,
            id_column: idCol?.name,
            replicate_column: repCol?.name,
            partition_column: partCol?.name,
            x_columns: xNames.length ? summarizeXColumns(xNames) : undefined,
            parsing: {
                separator: source.parsing.separator,
                decimal: source.parsing.decimal,
                header_mode: source.parsing.headerMode,
            },
        });
        for (const col of source.columns) {
            if (col.assignedRole === "y") {
                targets.push({ source: source.name, column: col.name, task: semanticToTask(col) });
            }
        }
        const metaNames = columnNames(source.columns, "metadata");
        if (metaNames.length)
            metadata.push({ source: source.name, columns: metaNames });
    }
    return {
        name,
        sources: exportSources,
        targets,
        metadata,
        joins: buildJoins(sources),
        partition: buildPartition(sources),
        replicates: buildReplicates(sources),
    };
}
function buildJoins(sources) {
    // Join every non-primary source back onto the first source that owns an ID,
    // keyed by the shared identifier name when both sides expose it.
    const withId = sources
        .map((s) => ({ source: s, idCol: firstColumn(s.columns, "id") }))
        .filter((entry) => entry.idCol);
    const left = withId[0];
    if (!left || !left.idCol)
        return [];
    const rest = withId.slice(1);
    const joins = [];
    for (const right of rest) {
        if (!right.idCol)
            continue;
        const on = left.idCol.name === right.idCol.name ? left.idCol.name : right.idCol.name;
        joins.push({ left: left.source.name, right: right.source.name, on, strategy: "strict" });
    }
    return joins;
}
function buildPartition(sources) {
    for (const source of sources) {
        const col = firstColumn(source.columns, "partition");
        if (col) {
            return {
                type: "column",
                column: col.name,
                values: {
                    train: ["train", "calibration", "cal"],
                    test: ["test", "prediction"],
                    validation: ["val", "validation", "dev"],
                },
            };
        }
    }
    return undefined;
}
function buildReplicates(sources) {
    for (const source of sources) {
        const col = firstColumn(source.columns, "replicate");
        if (col)
            return { column: col.name, strategy: "keep" };
    }
    return undefined;
}
//# sourceMappingURL=exportConfig.js.map