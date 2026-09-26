import type { PairResult, Patient, Trial } from "@/src/contracts";
import { orderCorresponds, orderFor } from "@/components/alert/alert";
import { blockerPhrase, clinicBucket, clinicFocus, resolveLine } from "@/components/hcp/clinic";
import type { DoctorOrder } from "@/components/hcp/DoctorActions";
import { collectLeaves, leafForCell, unknownCells } from "@/components/criteria/rows";
import { displayTone, toneCounts } from "@/components/criteria/tone";
import { rankPatientTrials } from "@/components/patient/rank";

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

/**
 * Every trial on this chart. Eligibility leads: no fails, then fewest unknowns.
 * A gap of one unknown is close, so significance (expected value over cost) breaks it.
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
  const ranked = rankPatientTrials(rows);
  const open = ranked.filter((row) => !row.eliminated);
  return open.length > 0 ? open : ranked;
}

export function unknownLabel(count: number): string {
  return count === 1 ? "1 unknown" : `${count} unknowns`;
}

/** What is holding the patient, and the order or wait that would resolve it. */
export function trialBlocks(patient: Patient, trial: Trial, pair: PairResult): Block[] {
  const leaves = collectLeaves(trial.criteria);
  if (pair.eliminated) {
    return pair.cells.flatMap((cell) => {
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
  }

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
