import type {
  CriterionLeaf,
  CriterionNode,
  CubeCell,
  Verdict,
} from "@/src/contracts";

export type GroupOp = "AND" | "OR" | "NOT";

export type LeafRow = {
  kind: "leaf";
  key: string;
  depth: number;
  leaf: CriterionLeaf;
  /** Undefined means the engine emitted no cell for this leaf — a bug, surfaced loudly. */
  cell?: CubeCell;
};

export type GroupRow = {
  kind: "group";
  key: string;
  depth: number;
  op: GroupOp;
  /** Display-only Kleene roll-up of the children's cell verdicts. */
  verdict: Verdict | null;
  sourceSpan?: string;
};

export type Row = LeafRow | GroupRow;

export type CriteriaSection = {
  type: "inclusion" | "exclusion";
  rows: Row[];
};

export function kleene(op: GroupOp, verdicts: Verdict[]): Verdict {
  if (op === "NOT") {
    const v = verdicts[0];
    return v === "PASS" ? "FAIL" : v === "FAIL" ? "PASS" : "UNKNOWN";
  }
  if (op === "AND") {
    if (verdicts.includes("FAIL")) return "FAIL";
    if (verdicts.includes("UNKNOWN")) return "UNKNOWN";
    return "PASS";
  }
  if (verdicts.includes("PASS")) return "PASS";
  if (verdicts.includes("UNKNOWN")) return "UNKNOWN";
  return "FAIL";
}

function firstLeaf(node: CriterionNode): CriterionLeaf | undefined {
  if (node.kind === "leaf") return node;
  for (const child of node.children) {
    const leaf = firstLeaf(child);
    if (leaf) return leaf;
  }
  return undefined;
}

/** Walk one node, append its rows, return its verdict (null if any cell is missing). */
function walk(
  node: CriterionNode,
  depth: number,
  path: string,
  cellsById: Map<string, CubeCell>,
  out: Row[],
): Verdict | null {
  if (node.kind === "leaf") {
    const cell = cellsById.get(node.id);
    out.push({ kind: "leaf", key: node.id, depth, leaf: node, cell });
    return cell ? cell.verdict : null;
  }
  const groupRow: GroupRow = {
    kind: "group",
    key: `group:${path}`,
    depth,
    op: node.op,
    verdict: null,
    sourceSpan: node.sourceSpan,
  };
  out.push(groupRow);
  const childVerdicts = node.children.map((child, i) =>
    walk(child, depth + 1, `${path}.${i}`, cellsById, out),
  );
  groupRow.verdict = childVerdicts.every((v): v is Verdict => v !== null)
    ? kleene(node.op, childVerdicts)
    : null;
  return groupRow.verdict;
}

/**
 * Flatten a trial's criteria tree into display rows, joined to one patient's cells.
 * Nested groups are preserved as group rows — never flattened into a plain list.
 */
export function buildSections(
  criteria: CriterionNode[],
  cells: CubeCell[],
): CriteriaSection[] {
  const cellsById = new Map(cells.map((c) => [c.criterionId, c]));
  const sections: Record<"inclusion" | "exclusion", Row[]> = {
    inclusion: [],
    exclusion: [],
  };
  criteria.forEach((node, i) => {
    const type = firstLeaf(node)?.type ?? "inclusion";
    walk(node, 0, String(i), cellsById, sections[type]);
  });
  return (["inclusion", "exclusion"] as const)
    .filter((type) => sections[type].length > 0)
    .map((type) => ({ type, rows: sections[type] }));
}

export function collectLeaves(criteria: CriterionNode[]): Map<string, CriterionLeaf> {
  const out = new Map<string, CriterionLeaf>();
  const visit = (node: CriterionNode) => {
    if (node.kind === "leaf") out.set(node.id, node);
    else node.children.forEach(visit);
  };
  criteria.forEach(visit);
  return out;
}

export function unknownCells(cells: CubeCell[]): CubeCell[] {
  return cells
    .filter((c) => c.verdict === "UNKNOWN")
    .sort((a, b) => a.tier - b.tier || a.criterionId.localeCompare(b.criterionId));
}
