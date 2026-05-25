import type { CSSProperties } from 'react';
import type { DependencyEdge } from '../types/swap';
import { colors, fonts, sizes, spacing } from '../styles/tokens';
import { panel, panelHeader, panelTitle, panelBody } from '../styles/components';

interface DependencyGraphPanelProps {
  edges: DependencyEdge[];
}

function shortKey(key: string): string {
  const parts = key.split('::');
  const file = parts[0].split('/').pop() ?? parts[0];
  return `${file}::${parts[1]}`;
}

function buildAdjacency(edges: DependencyEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    const list = map.get(e.from) ?? [];
    list.push(e.to);
    map.set(e.from, list);
  }
  return map;
}

function getTopLevelNodes(edges: DependencyEdge[]): string[] {
  const allTo = new Set(edges.map((e) => e.to));
  const allFrom = new Set(edges.map((e) => e.from));
  const roots = [...allFrom].filter((f) => !allTo.has(f));
  return roots.length > 0 ? roots : [...allFrom].slice(0, 3);
}

const s = {
  body: {
    ...panelBody,
    padding: spacing.md,
    fontFamily: fonts.mono,
    fontSize: sizes.sm,
    overflowX: 'auto' as const,
  } as CSSProperties,

  node: (depth: number, _isLast: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs}px 0`,
    paddingLeft: depth * 20,
    whiteSpace: 'nowrap' as const,
    color: depth === 0 ? colors.green : depth === 1 ? colors.cyan : colors.greenDim,
    fontSize: sizes.sm,
  }),

  prefix: (_depth: number, _isLast: boolean) => ({
    color: colors.grayDim,
    flexShrink: 0,
  } as CSSProperties),

  kindTag: (_kind: string): CSSProperties => ({
    fontSize: sizes.xs,
    color: colors.grayDim,
    fontFamily: fonts.mono,
    marginLeft: spacing.xs,
  }),

  edgeKindTag: (kind: string): CSSProperties => ({
    fontSize: sizes.xs,
    color: kind === 'call' ? colors.amber : kind === 'type-use' ? colors.cyanDim : colors.greenDim,
    fontFamily: fonts.mono,
    marginLeft: spacing.xs,
  }),
};

interface TreeNodeProps {
  nodeKey: string;
  adj: Map<string, string[]>;
  edges: DependencyEdge[];
  depth: number;
  isLast: boolean;
  visited: Set<string>;
}

function TreeNode({ nodeKey, adj, edges, depth, isLast, visited }: TreeNodeProps) {
  const children = adj.get(nodeKey) ?? [];
  const prefix = depth === 0 ? '◆' : isLast ? '└─' : '├─';
  const edge = edges.find((e) => e.to === nodeKey);

  return (
    <>
      <div style={s.node(depth, isLast)}>
        <span style={s.prefix(depth, isLast)}>{prefix}</span>
        <span>{shortKey(nodeKey)}</span>
        {edge && <span style={s.edgeKindTag(edge.kind)}>[{edge.kind}]</span>}
      </div>
      {!visited.has(nodeKey) && children.map((child, i) => {
        const nextVisited = new Set([...visited, nodeKey]);
        return (
          <TreeNode
            key={child}
            nodeKey={child}
            adj={adj}
            edges={edges}
            depth={depth + 1}
            isLast={i === children.length - 1}
            visited={nextVisited}
          />
        );
      })}
    </>
  );
}

export function DependencyGraphPanel({ edges }: DependencyGraphPanelProps) {
  const adj = buildAdjacency(edges);
  const roots = getTopLevelNodes(edges);

  return (
    <div style={panel}>
      <div style={panelHeader}>
        <span style={panelTitle}>┤ DEP GRAPH ├</span>
        <span style={{ fontSize: sizes.xs, color: colors.greenDim, fontFamily: fonts.mono }}>
          {edges.length} edges
        </span>
      </div>
      <div style={s.body}>
        {roots.map((r) => (
          <TreeNode
            key={r}
            nodeKey={r}
            adj={adj}
            edges={edges}
            depth={0}
            isLast={true}
            visited={new Set()}
          />
        ))}
      </div>
    </div>
  );
}
