import type { PairResult } from "@/src/contracts";

/** Cohort counts for the worklist header, derived only from evaluate() pairs. */
export type WorklistStrip = {
  pairsEvaluated: number;
  eligibleNow: number;
  oneTier0Away: number;
};

/**
 * A pair is eligible now when the engine did not eliminate it and no criterion
 * is UNKNOWN. It is one Tier-0 away when the only remaining unknown is a single
 * existing-specimen (tier 0) criterion — resolve that and the pair is eligible.
 */
export function worklistStrip(pairs: PairResult[]): WorklistStrip {
  let eligibleNow = 0;
  let oneTier0Away = 0;
  for (const pair of pairs) {
    if (pair.eliminated) continue;
    const unknowns = pair.cells.filter((c) => c.verdict === "UNKNOWN");
    if (unknowns.length === 0) eligibleNow += 1;
    else if (unknowns.length === 1 && unknowns[0].tier === 0) oneTier0Away += 1;
  }
  return { pairsEvaluated: pairs.length, eligibleNow, oneTier0Away };
}
