/**
 * Group hierarchy derived from node `group` paths.
 *
 * A DAG is not a tree, but nodes carry a hierarchical *group* path (e.g.
 * `["branch:b0"]`). Those paths form a nesting tree of clusters that the viewer
 * can collapse/expand independently of the edge topology. This module turns the
 * flat node list into that cluster tree; everything here is pure and testable.
 */
const SEP = "/";
function groupIdOf(path, end) {
    return path.slice(0, end).join(SEP);
}
/** Build the cluster tree for a graph. O(nodes × path depth). */
export function buildHierarchy(graph) {
    const groups = new Map();
    const roots = [];
    const nodeGroupId = new Map();
    let maxDepth = -1;
    const ensure = (path, depth) => {
        const id = groupIdOf(path, depth + 1);
        const existing = groups.get(id);
        if (existing)
            return existing;
        const parentId = depth > 0 ? groupIdOf(path, depth) : null;
        const group = {
            id,
            label: path[depth] ?? id,
            path: path.slice(0, depth + 1),
            depth,
            parent: parentId,
            children: [],
            memberIds: [],
            descendantLeafCount: 0,
        };
        groups.set(id, group);
        if (parentId === null) {
            roots.push(id);
        }
        else {
            const parent = groups.get(parentId);
            if (parent)
                parent.children.push(id);
        }
        if (depth > maxDepth)
            maxDepth = depth;
        return group;
    };
    for (const node of graph.nodes) {
        const path = node.group?.filter((seg) => seg.length > 0) ?? [];
        if (path.length === 0) {
            nodeGroupId.set(node.id, null);
            continue;
        }
        // Materialize every prefix so intermediate clusters exist even if empty.
        for (let depth = 0; depth < path.length; depth += 1) {
            const group = ensure(path, depth);
            group.descendantLeafCount += 1;
        }
        const innermost = ensure(path, path.length - 1);
        innermost.memberIds.push(node.id);
        nodeGroupId.set(node.id, innermost.id);
    }
    return { groups, roots, nodeGroupId, maxDepth };
}
/** Ancestor group ids for a node, innermost → outermost. */
export function ancestorGroupIds(hierarchy, nodeId) {
    const chain = [];
    let current = hierarchy.nodeGroupId.get(nodeId) ?? null;
    while (current !== null) {
        chain.push(current);
        current = hierarchy.groups.get(current)?.parent ?? null;
    }
    return chain;
}
//# sourceMappingURL=hierarchy.js.map