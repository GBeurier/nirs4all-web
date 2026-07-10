/**
 * Dataset Builder view-model types.
 *
 * The reusable contract shared by every host of the `DatasetBuilder` wizard.
 * Hosts parse files into `DatasetSource` descriptors (columns + preview values +
 * detected native types) and hand them to the component; the package never reads
 * files, hits the network, or executes a runtime — it only derives roles,
 * validation, partitions, and the final export config from these descriptors.
 */
export const DEFAULT_ADVANCED_OPTIONS = {
    joinStrategy: "strict",
    replicateStrategy: "keep",
    multiSourceAlign: "sample_id",
    missingPolicy: "forbid",
    yTask: "auto",
};
//# sourceMappingURL=types.js.map