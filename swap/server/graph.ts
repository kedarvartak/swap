import type { SymbolKey, DependencyEdge, EdgeKind } from '../shared/types.js';
import { DEPENDENCY_GRAPH_MAX_DEPTH } from '../shared/constants.js';

export class DependencyGraph {
  // from → set of (to, kind)
  private edges = new Map<SymbolKey, { to: SymbolKey; kind: EdgeKind }[]>();
  // reverse index: to → set of from (for finding dependents)
  private reverseEdges = new Map<SymbolKey, Set<SymbolKey>>();

  addEdge(from: SymbolKey, to: SymbolKey, kind: EdgeKind): void {
    const outgoing = this.edges.get(from) ?? [];
    if (!outgoing.some((e) => e.to === to && e.kind === kind)) {
      outgoing.push({ to, kind });
      this.edges.set(from, outgoing);
    }

    const incoming = this.reverseEdges.get(to) ?? new Set();
    incoming.add(from);
    this.reverseEdges.set(to, incoming);
  }

  removeEdgesFrom(key: SymbolKey): void {
    const outgoing = this.edges.get(key) ?? [];
    for (const { to } of outgoing) {
      this.reverseEdges.get(to)?.delete(key);
    }
    this.edges.delete(key);
  }

  // Direct dependents only
  getDependents(key: SymbolKey): SymbolKey[] {
    return Array.from(this.reverseEdges.get(key) ?? []);
  }

  // BFS up to maxDepth levels, returns count of unique transitive dependents
  countTransitiveDependents(key: SymbolKey, maxDepth = DEPENDENCY_GRAPH_MAX_DEPTH): number {
    return this.getTransitiveDependents(key, maxDepth).size;
  }

  getTransitiveDependents(key: SymbolKey, maxDepth = DEPENDENCY_GRAPH_MAX_DEPTH): Set<SymbolKey> {
    const visited = new Set<SymbolKey>();
    const queue: { key: SymbolKey; depth: number }[] = [{ key, depth: 0 }];

    while (queue.length > 0) {
      const { key: current, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      for (const dependent of this.reverseEdges.get(current) ?? []) {
        if (!visited.has(dependent)) {
          visited.add(dependent);
          queue.push({ key: dependent, depth: depth + 1 });
        }
      }
    }

    return visited;
  }

  maxDependentCount(): number {
    let max = 0;
    for (const key of this.reverseEdges.keys()) {
      const count = this.countTransitiveDependents(key);
      if (count > max) max = count;
    }
    return max;
  }

  // Called after a SemanticDiff arrives — rebuilds edges for changed symbols
  updateFromEdges(edges: DependencyEdge[]): void {
    for (const { from, to, kind } of edges) {
      this.addEdge(from, to, kind);
    }
  }

  size(): number {
    return this.edges.size;
  }
}
