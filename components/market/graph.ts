import type { Assignment, PairResult } from "@/src/contracts";

export type Mode = Assignment["mode"];
export const MODES: Mode[] = ["adhoc", "stable", "stable_dap"];

export type GraphNode = { id: string; label: string; x: number; y: number; side: "patient" | "trial" };

export type GraphEdge = {
  key: string;
  patientId: string;
  nctId: string;
  /** A candidate pair is one the cube did not eliminate; `unknown` if it still has UNKNOWNs. */
  status: "eligible" | "unknown";
};

export type ModeLayout = {
  assignment: Assignment;
  assigned: string[];
  /** Assignment pairs the cube eliminated or never evaluated — a bug upstream, drawn loudly. */
  invalid: { patientId: string; nctId: string }[];
  load: Record<string, number>;
};

export type Graph = {
  width: number;
  height: number;
  patients: GraphNode[];
  trials: (GraphNode & { slots: number })[];
  candidates: GraphEdge[];
  modes: Partial<Record<Mode, ModeLayout>>;
};

export const GRAPH = { width: 320, rowHeight: 56, padY: 28, patientX: 70, trialX: 250 } as const;

export const edgeKey = (patientId: string, nctId: string) => `${patientId}→${nctId}`;

function column(ids: string[], x: number, height: number, side: GraphNode["side"]): GraphNode[] {
  const step = ids.length > 1 ? (height - GRAPH.padY * 2) / (ids.length - 1) : 0;
  return ids.map((id, i) => ({
    id,
    label: id,
    x,
    y: ids.length > 1 ? GRAPH.padY + i * step : height / 2,
    side,
  }));
}

/** Everything the view needs, for every mode, computed once. Toggling reads a lookup. */
export function buildGraph(
  patientIds: string[],
  trials: { nctId: string; slots: number }[],
  cube: PairResult[],
  assignments: Assignment[],
): Graph {
  const rows = Math.max(patientIds.length, trials.length, 1);
  const height = GRAPH.padY * 2 + (rows - 1) * GRAPH.rowHeight;

  const candidates: GraphEdge[] = cube
    .filter((p) => !p.eliminated)
    .map((p) => ({
      key: edgeKey(p.patientId, p.nctId),
      patientId: p.patientId,
      nctId: p.nctId,
      status: p.unknownCount > 0 ? ("unknown" as const) : ("eligible" as const),
    }));
  const candidateKeys = new Set(candidates.map((e) => e.key));

  const modes: Graph["modes"] = {};
  for (const a of assignments) {
    const load: Record<string, number> = Object.fromEntries(trials.map((t) => [t.nctId, 0]));
    const assigned: string[] = [];
    const invalid: { patientId: string; nctId: string }[] = [];
    for (const pair of a.pairs) {
      const key = edgeKey(pair.patientId, pair.nctId);
      if (candidateKeys.has(key)) assigned.push(key);
      else invalid.push(pair);
      load[pair.nctId] = (load[pair.nctId] ?? 0) + 1;
    }
    modes[a.mode] = { assignment: a, assigned, invalid, load };
  }

  return {
    width: GRAPH.width,
    height,
    patients: column(patientIds, GRAPH.patientX, height, "patient"),
    trials: column(trials.map((t) => t.nctId), GRAPH.trialX, height, "trial").map((n, i) => ({
      ...n,
      slots: trials[i].slots,
    })),
    candidates,
    modes,
  };
}
