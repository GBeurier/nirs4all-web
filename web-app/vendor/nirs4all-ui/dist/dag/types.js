/**
 * Package-level view-model contract for the interactive compiled-DAG viewer.
 *
 * This is a small, framework-free contract — deliberately NOT a dependency on
 * `dag-ml`. A host adapts a real compiled `GraphSpec` / `ExecutionPlan` into a
 * {@link DagGraph} (see {@link file://./fromCompiledGraph.ts fromCompiledGraph}),
 * or builds one directly. Everything downstream (hierarchy, collapse, layout,
 * rendering) operates on this contract only.
 */
const KIND_TO_CATEGORY = {
    // data sources / restructuring
    source: "data",
    adapter: "data",
    restructure: "data",
    source_join: "data",
    data: "data",
    // splits / cross-validation
    split: "split",
    // preprocessing / feature ops
    transform: "preprocess",
    y_transform: "preprocess",
    augmentation: "preprocess",
    exclude: "preprocess",
    tag: "preprocess",
    preprocess: "preprocess",
    // estimators
    model: "model",
    predict: "model",
    // merges / joins
    feature_join: "merge",
    prediction_join: "merge",
    mixed_join: "merge",
    merge: "merge",
    join: "merge",
    // fan-out
    fork: "branch",
    map: "branch",
    branch: "branch",
    // variant generation / tuning / selection
    generator: "search",
    tuner: "search",
    select: "search",
    // aggregation
    aggregator: "aggregate",
    aggregate: "aggregate",
    // nested graph / charts
    subgraph: "subgraph",
    chart: "chart",
};
/** Resolve a raw `kind` string to its coarse visual {@link DagCategory}. */
export function dagCategory(kind) {
    if (!kind)
        return "unknown";
    return KIND_TO_CATEGORY[kind] ?? "unknown";
}
//# sourceMappingURL=types.js.map