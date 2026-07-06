/**
 * Pure dataset preview view-model helpers.
 *
 * Hosts keep ownership of dataset loading and schema adapters; this module only
 * turns small, package-level display contracts into reusable labels, stats, and
 * badges for Studio/Web dataset cards.
 */
function readTrimmedString(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function parseFiniteNumber(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
export function parseDatasetCount(value) {
    const parsed = parseFiniteNumber(value);
    return parsed != null && parsed >= 0 ? Math.trunc(parsed) : null;
}
function firstDatasetCount(...values) {
    for (const value of values) {
        const count = parseDatasetCount(value);
        if (count != null)
            return count;
    }
    return null;
}
const COUNT_FORMATTER = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
});
const RANGE_FORMATTER = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
});
export function formatDatasetCount(value, singular, plural = `${singular}s`) {
    const count = parseDatasetCount(value);
    if (count == null)
        return null;
    return `${COUNT_FORMATTER.format(count)} ${count === 1 ? singular : plural}`;
}
function formatCountValue(value) {
    return value == null ? "Unknown" : COUNT_FORMATTER.format(value);
}
function normalizeLookupToken(value) {
    return readTrimmedString(value)?.toLowerCase().replace(/[\s_]+/g, "-") ?? "";
}
export function resolveDatasetTaskKind(taskType) {
    const normalized = normalizeLookupToken(taskType);
    if (!normalized)
        return "unknown";
    if (normalized.includes("mixed") || normalized.includes("multi-task"))
        return "mixed";
    if (normalized.includes("class"))
        return "classification";
    if (normalized.includes("regress"))
        return "regression";
    return "unknown";
}
export function formatDatasetTaskLabel(taskType) {
    const kind = resolveDatasetTaskKind(taskType);
    if (kind === "classification")
        return "Classification";
    if (kind === "regression")
        return "Regression";
    if (kind === "mixed")
        return "Mixed tasks";
    const trimmed = readTrimmedString(taskType);
    if (!trimmed)
        return "Dataset";
    return formatDatasetTokenLabel(trimmed);
}
export function formatDatasetTokenLabel(value) {
    const trimmed = readTrimmedString(value);
    if (!trimmed)
        return "";
    return trimmed
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => {
        const lower = part.toLowerCase();
        if (lower === "id")
            return "ID";
        if (lower === "nirs")
            return "NIRS";
        if (lower === "nir")
            return "NIR";
        if (lower === "uv")
            return "UV";
        if (lower === "vis")
            return "VIS";
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
        .join(" ");
}
function percentageLabel(percentage) {
    if (percentage == null)
        return null;
    return `${RANGE_FORMATTER.format(percentage)}%`;
}
function splitEntries(input) {
    if (!input)
        return [];
    if (Array.isArray(input))
        return [...input];
    return Object.entries(input).map(([key, count]) => ({
        id: key,
        count,
    }));
}
function isSpectralRangeTuple(range) {
    return Array.isArray(range);
}
export function normalizeDatasetSplitCounts(input, sampleCount) {
    const total = parseDatasetCount(sampleCount);
    const seen = new Set();
    return splitEntries(input)
        .map((entry, index) => {
        const count = parseDatasetCount(entry.count);
        if (count == null)
            return null;
        const rawId = readTrimmedString(entry.id) ?? readTrimmedString(entry.key) ?? readTrimmedString(entry.label);
        const id = normalizeLookupToken(rawId) || `split-${index + 1}`;
        if (seen.has(id))
            return null;
        seen.add(id);
        const percentage = total && total > 0
            ? Math.round((count / total) * 1000) / 10
            : null;
        return {
            id,
            label: readTrimmedString(entry.label) ?? (formatDatasetTokenLabel(rawId) || `Split ${index + 1}`),
            count,
            countLabel: formatDatasetCount(count, "sample") ?? "0 samples",
            percentage,
            percentageLabel: percentageLabel(percentage),
        };
    })
        .filter((entry) => entry != null);
}
function readSpectralRangeValue(range, keys) {
    if (!range)
        return null;
    if (isSpectralRangeTuple(range)) {
        const index = keys.includes("start") || keys.includes("min") ? 0 : 1;
        return parseFiniteNumber(range[index]);
    }
    for (const key of keys) {
        const value = parseFiniteNumber(range[key]);
        if (value != null)
            return value;
    }
    return null;
}
function readSpectralRangeUnit(range) {
    if (!range || isSpectralRangeTuple(range))
        return "nm";
    return readTrimmedString(range.unit) ?? "nm";
}
export function formatDatasetSpectralRange(range) {
    const start = readSpectralRangeValue(range, ["start", "min"]);
    const end = readSpectralRangeValue(range, ["end", "max"]);
    if (start == null && end == null)
        return null;
    const unit = readSpectralRangeUnit(range);
    if (start != null && end != null) {
        const lower = Math.min(start, end);
        const upper = Math.max(start, end);
        return `${RANGE_FORMATTER.format(lower)}-${RANGE_FORMATTER.format(upper)} ${unit}`;
    }
    if (start != null)
        return `from ${RANGE_FORMATTER.format(start)} ${unit}`;
    if (end != null)
        return `up to ${RANGE_FORMATTER.format(end)} ${unit}`;
    return null;
}
function normalizeTags(tags) {
    const seen = new Set();
    const normalized = [];
    for (const tag of tags ?? []) {
        const label = readTrimmedString(tag);
        if (!label)
            continue;
        const key = normalizeLookupToken(label);
        if (seen.has(key))
            continue;
        seen.add(key);
        normalized.push(label);
    }
    return normalized;
}
function buildSplitSummaryLabel(splits) {
    if (splits.length === 0)
        return null;
    return splits
        .map((split) => split.percentageLabel
        ? `${split.label} ${split.percentageLabel}`
        : `${split.label} ${split.countLabel}`)
        .join(", ");
}
function buildBadges(taskLabel, taskKind, splitSummaryLabel, spectralRangeLabel, tags) {
    const badges = [
        {
            id: "task",
            label: taskLabel,
            tone: taskKind === "unknown" ? "muted" : "default",
        },
    ];
    if (spectralRangeLabel) {
        badges.push({ id: "range", label: spectralRangeLabel, tone: "muted" });
    }
    if (splitSummaryLabel) {
        badges.push({ id: "splits", label: splitSummaryLabel, tone: "muted" });
    }
    for (const tag of tags) {
        badges.push({
            id: `tag-${normalizeLookupToken(tag)}`,
            label: tag,
            tone: "default",
        });
    }
    return badges;
}
function buildStats(view) {
    const stats = [
        {
            id: "samples",
            label: "Samples",
            value: formatCountValue(view.sampleCount),
            detail: view.splitSummaryLabel,
            tone: view.sampleCount == null ? "warning" : "default",
        },
        {
            id: "features",
            label: "Features",
            value: formatCountValue(view.featureCount),
            detail: view.spectralRangeLabel,
            tone: view.featureCount == null ? "muted" : "default",
        },
    ];
    if (view.classCount != null) {
        stats.push({
            id: "classes",
            label: "Classes",
            value: formatCountValue(view.classCount),
            detail: view.targetCountLabel,
            tone: "default",
        });
    }
    else if (view.targetCount != null) {
        stats.push({
            id: "targets",
            label: "Targets",
            value: formatCountValue(view.targetCount),
            detail: null,
            tone: "default",
        });
    }
    if (view.splitCounts.length > 0) {
        stats.push({
            id: "splits",
            label: "Splits",
            value: COUNT_FORMATTER.format(view.splitCounts.length),
            detail: view.splitSummaryLabel,
            tone: "muted",
        });
    }
    if (view.spectralRangeLabel && view.featureCount == null) {
        stats.push({
            id: "range",
            label: "Range",
            value: view.spectralRangeLabel,
            detail: null,
            tone: "muted",
        });
    }
    return stats;
}
export function buildDatasetPreview(input) {
    if (!input)
        return null;
    const title = readTrimmedString(input.title)
        ?? readTrimmedString(input.name)
        ?? readTrimmedString(input.id)
        ?? "Untitled dataset";
    const description = readTrimmedString(input.description);
    const taskKind = resolveDatasetTaskKind(input.taskType);
    const taskLabel = formatDatasetTaskLabel(input.taskType);
    const sampleCount = firstDatasetCount(input.sampleCount, input.spectrumCount, input.rowCount);
    const featureCount = firstDatasetCount(input.featureCount, input.wavelengthCount);
    const targetCount = parseDatasetCount(input.targetCount);
    const classCount = parseDatasetCount(input.classCount);
    const splitCounts = normalizeDatasetSplitCounts(input.splitCounts ?? input.splits, sampleCount);
    const splitSummaryLabel = buildSplitSummaryLabel(splitCounts);
    const spectralRangeLabel = formatDatasetSpectralRange(input.spectralRange);
    const tags = normalizeTags(input.tags);
    const baseView = {
        id: readTrimmedString(input.id),
        title,
        description,
        taskKind,
        taskLabel,
        sampleCount,
        sampleCountLabel: formatDatasetCount(sampleCount, "sample"),
        featureCount,
        featureCountLabel: formatDatasetCount(featureCount, "feature"),
        targetCount,
        targetCountLabel: formatDatasetCount(targetCount, "target"),
        classCount,
        classCountLabel: formatDatasetCount(classCount, "class", "classes"),
        spectralRangeLabel,
        splitCounts,
        splitSummaryLabel,
        tags,
    };
    return {
        ...baseView,
        badges: buildBadges(taskLabel, taskKind, splitSummaryLabel, spectralRangeLabel, tags),
        stats: buildStats(baseView),
    };
}
//# sourceMappingURL=datasetPreview.js.map