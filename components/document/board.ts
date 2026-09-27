import type { PairResult, Patient, Trial } from "@/src/contracts";
import { orderCorresponds, orderFor } from "@/components/alert/alert";
import { blockerPhrase, clinicBucket, clinicFocus, resolveLine } from "@/components/hcp/clinic";
import type { DoctorOrder } from "@/components/hcp/DoctorActions";
import { collectLeaves, leafForCell, unknownCells } from "@/components/criteria/rows";
import { displayTone, toneCounts } from "@/components/criteria/tone";

export type BoardEntry = {
  nctId: string;
  title: string;
  eliminated: boolean;
  unknownCount: number;
  expectedValue: number;
  resolutionCost: number;
  /** Criteria the patient clears. A cleared exclusion counts. */
  met: number;
  total: number;
};

export type Block = {
  criterionId: string;
  blocking: string;
  resolve: string;
};

/** A trial with no cube row is still unknown — never a fail. */
export function openPair(patientId: string, trial: Trial): PairResult {
  const leaves = [...collectLeaves(trial.criteria).values()];
  return {
    patientId,
    nctId: trial.nctId,
    eliminated: false,
    passCount: 0,
    failCount: 0,
    unknownCount: leaves.length,
    resolutionCost: 0,
    expectedValue: 0,
    cells: leaves.map((leaf) => ({
      patientId,
      nctId: trial.nctId,
      criterionId: leaf.id,
      verdict: "UNKNOWN" as const,
      reason: "absent" as const,
      criterionCitation: leaf.sourceSpan,
      tier: leaf.tier,
    })),
  };
}

/** Score every catalog trial. Missing pairs stay UNKNOWN. */
export function withOpenTrials(
  patientId: string,
  pairs: readonly PairResult[],
  trials: readonly Trial[],
): PairResult[] {
  const have = new Set(pairs.map((pair) => pair.nctId));
  const extra = trials.filter((trial) => !have.has(trial.nctId)).map((trial) => openPair(patientId, trial));
  return extra.length === 0 ? [...pairs] : [...pairs, ...extra];
}

/**
 * Every trial on this chart, from fully eligible, through the fewest
 * conditions still open, down to ruled out.
 */
export function boardEntries(
  pairs: readonly PairResult[],
  trialOf: (nctId: string) => Trial | undefined,
): BoardEntry[] {
  const rows: BoardEntry[] = [];
  for (const pair of pairs) {
    const trial = trialOf(pair.nctId);
    if (!trial) continue;
    const leaves = collectLeaves(trial.criteria);
    const tones = toneCounts(pair.cells, (id) => leaves.get(id)?.type);
    rows.push({
      nctId: pair.nctId,
      title: trial.title,
      eliminated: pair.eliminated,
      unknownCount: pair.unknownCount,
      expectedValue: pair.expectedValue,
      resolutionCost: pair.resolutionCost,
      met: tones.green,
      total: leaves.size,
    });
  }
  const order = { eligible: 0, partial: 1, open: 2, rejected: 3 };
  return rows.sort((a, b) => {
    const standing = order[standingOf(a)] - order[standingOf(b)];
    if (standing !== 0) return standing;
    const fill = filledShare(b) - filledShare(a);
    if (fill !== 0) return fill;
    const unknowns = a.unknownCount - b.unknownCount;
    if (unknowns !== 0) return unknowns;
    const met = b.met - a.met;
    if (met !== 0) return met;
    return a.nctId.localeCompare(b.nctId);
  });
}

export type Standing = "eligible" | "partial" | "open" | "rejected";

/** Partially fulfilled means more than 40% of the conditions are already green. */
export const PARTIAL_FLOOR = 0.4;

export function filledShare(row: Pick<BoardEntry, "met" | "total">): number {
  return row.total > 0 ? row.met / row.total : 0;
}

/** Share of conditions that already have an answer — green or red. */
export function decidedShare(row: Pick<BoardEntry, "unknownCount" | "met" | "total">): number {
  if (row.total <= 0) return 0;
  const failed = row.total - row.met - row.unknownCount;
  return (row.met + Math.max(failed, 0)) / row.total;
}

/** Eligible means every condition is fulfilled. Rejected only when a real share of the protocol was decided and at least one condition is red — a single fail on a mostly-unknown trial stays open. */
export function standingOf(row: Pick<BoardEntry, "eliminated" | "unknownCount" | "met" | "total">): Standing {
  const failed = row.total - row.met - row.unknownCount;
  const blocked = row.eliminated || failed > 0;
  if (blocked && decidedShare(row) > PARTIAL_FLOOR) return "rejected";
  if (!blocked && row.total > 0 && row.met === row.total && row.unknownCount === 0) return "eligible";
  if (filledShare(row) > PARTIAL_FLOOR) return "partial";
  return "open";
}

export function unknownLabel(count: number): string {
  return count === 1 ? "1 unknown" : `${count} unknowns`;
}

/** What is holding the patient, and the order or wait that would resolve it. */
export function trialBlocks(patient: Patient, trial: Trial, pair: PairResult): Block[] {
  const leaves = collectLeaves(trial.criteria);
  const reds = pair.cells.flatMap((cell) => {
    const leaf = leaves.get(cell.criterionId);
    if (!leaf || displayTone(cell, leaf.type) !== "red") return [];
    return [
      {
        criterionId: cell.criterionId,
        blocking: blockerPhrase(leaf, cell.reason, patient, true),
        resolve: resolveLine("ruled-out"),
      },
    ];
  });
  if (pair.eliminated || reds.length > 0) return reds;

  return unknownCells(pair.cells).map((cell) => {
    const leaf = leafForCell(trial.criteria, cell);
    const order = leaf ? orderFor(leaf, cell, patient) : undefined;
    const matches = Boolean(leaf && order && orderCorresponds(leaf, cell, order));
    const bucket = clinicBucket({
      eliminated: false,
      unknownCount: 1,
      predicate: leaf?.predicate,
      reason: cell.reason,
    });
    return {
      criterionId: cell.criterionId,
      blocking: blockerPhrase(leaf, cell.reason, patient, false),
      resolve: matches && order ? resolveLine(bucket, order.title) : resolveLine(bucket),
    };
  });
}

/** The single order DoctorActions can draft. Same rule as the chart page. */
export function focusOrder(patient: Patient, trial: Trial, pair: PairResult): DoctorOrder | undefined {
  const focus = clinicFocus(pair, trial);
  if (!focus || pair.eliminated) return undefined;
  const built = orderFor(focus.leaf, focus.cell, patient);
  if (!orderCorresponds(focus.leaf, focus.cell, built)) return undefined;
  return {
    title: built.title,
    detail: built.detail,
    criterionId: focus.cell.criterionId,
    tier: focus.cell.tier,
  };
}
