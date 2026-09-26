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

/** Industry screen-fail baseline (Tufts CSDD / published oncology screening). */
export const SCREEN_FAIL_RATE = 0.62;
export const SCREEN_FAIL_COST = 2000;

export type ScreenFailures = {
  patientsScreened: number;
  expectedFailures: number;
  failuresAvoided: number;
  dollarsAvoided: number;
};

/**
 * Old world: 62% of screened patients fail at the site ($2,000 each).
 * AMBER only writes a patient off when a criterion actually eliminates them —
 * absence stays UNKNOWN. Failures avoided = expected baseline minus those
 * true eliminations.
 */
export function screenFailures(rows: { eliminated: boolean }[]): ScreenFailures {
  const patientsScreened = rows.length;
  const expectedFailures = Math.round(patientsScreened * SCREEN_FAIL_RATE);
  const eliminated = rows.filter((r) => r.eliminated).length;
  const failuresAvoided = Math.max(0, expectedFailures - eliminated);
  return {
    patientsScreened,
    expectedFailures,
    failuresAvoided,
    dollarsAvoided: failuresAvoided * SCREEN_FAIL_COST,
  };
}

export function formatDollars(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/** Measured full-cube run — 4,000 patients × 233 compiled trials. Not a peak. */
export const MEASURED_BENCH = {
  cells: 20_420_000,
  seconds: 8.76,
  patients: 4_000,
  trials: 233,
} as const;

export function formatBench(b: typeof MEASURED_BENCH): string {
  return `measured: ${b.cells.toLocaleString("en-US")} criterion evaluations in ${b.seconds}s · ${b.patients.toLocaleString("en-US")} patients × ${b.trials} trials`;
}
