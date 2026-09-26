/**
 * What a claims-only cohort can and cannot be told about trial eligibility.
 *
 * `coverage.ts` sizes the gap from the protocol side: what share of criteria a
 * claim could ever answer. This sizes it from the patient side: run a real
 * claims-derived cohort against real trials and count what actually comes out.
 *
 * THE NUMBER THAT MATTERS IS THE ONE THAT SHOULD BE NEAR ZERO.
 * `confirmedEligiblePairs` counts beneficiaries a claims feed alone establishes
 * as eligible — every criterion decided, nothing outstanding. It should be
 * approximately nothing, and that is the finding, not a disappointment. Claims
 * can rule people out wholesale and can almost never rule anyone in, because
 * ruling in needs lab values, biomarkers and a performance status, and a claim
 * carries none of them. A vendor who says they screen from claims is either
 * quietly relaxing the criteria or quietly guessing.
 *
 * `definitivelyExcludedPairs` is the mirror, and it is the commercially useful
 * half: exclusions resolved cheaply, at population scale, with no chart pulled.
 *
 * The provenance mix is reported first and deliberately. If the cohort turns out
 * to carry chart facts, every conclusion below is about something other than a
 * claims feed, and the report says so rather than letting the headline stand.
 *
 * Pure: takes records, returns a report.
 */
import type { Patient, Reason, Trial } from "@/src/contracts";
import { evaluate, type EvaluateOptions } from "./evaluate";
import type { Provenance } from "./provenance";

export interface ClaimsCohortReport {
  /** The sentence for the slide, generated from the counts. */
  headline: string;
  /** What the cohort actually is, checked rather than assumed. */
  cohort: {
    patients: number;
    facts: number;
    /** Fact counts by provenance. A claims cohort should be all `claims`. */
    byProvenance: Record<Provenance, number>;
    /** True when every fact is claims-derived, so the headline means what it says. */
    claimsOnly: boolean;
  };
  trials: number;
  pairs: number;

  /** Pairs where claims alone settle it: the patient is out. */
  definitivelyExcludedPairs: number;
  shareDefinitivelyExcluded: number;
  /** Beneficiaries excluded from every trial in the pool. */
  patientsExcludedFromAllTrials: number;

  /**
   * Pairs where claims alone establish eligibility — nothing outstanding.
   * Expected to be at or near zero; see the module header.
   */
  confirmedEligiblePairs: number;
  shareConfirmedEligible: number;

  /** Pairs still open: not excluded, but with at least one unresolved criterion. */
  undeterminedPairs: number;

  meanUnknownsPerPair: number;
  medianUnknownsPerPair: number;
  /** Cells by the reason the engine gave, which is what drives the next action. */
  cellsByReason: Record<Reason, number>;
  totalCells: number;
}

const ZERO_BY_REASON = (): Record<Reason, number> => ({
  satisfied: 0,
  contradicted: 0,
  absent: 0,
  stale: 0,
  unsupported: 0,
});

const share = (n: number, of: number): number => (of === 0 ? 0 : Number((n / of).toFixed(6)));

/** Evaluate a claims-derived cohort against a trial pool and count the outcomes. */
export function claimsCohortEvaluation(
  patients: readonly Patient[],
  trials: readonly Trial[],
  asOf: string,
  options: EvaluateOptions = {},
): ClaimsCohortReport {
  const byProvenance: Record<Provenance, number> = {
    chart: 0,
    claims: 0,
    patient_reported: 0,
  };
  let facts = 0;
  for (const p of patients) {
    for (const f of p.facts) {
      facts++;
      byProvenance[f.provenance]++;
    }
  }

  const cellsByReason = ZERO_BY_REASON();
  const unknownCounts: number[] = [];
  let definitivelyExcludedPairs = 0;
  let confirmedEligiblePairs = 0;
  let undeterminedPairs = 0;
  let totalCells = 0;
  let patientsExcludedFromAllTrials = 0;

  for (const patient of patients) {
    let excludedEverywhere = trials.length > 0;
    for (const trial of trials) {
      const result = evaluate(patient, trial, asOf, options);
      totalCells += result.cells.length;
      for (const cell of result.cells) cellsByReason[cell.reason]++;
      unknownCounts.push(result.unknownCount);

      if (result.eliminated) {
        definitivelyExcludedPairs++;
        continue;
      }
      excludedEverywhere = false;
      // Not excluded and nothing outstanding: claims alone proved eligibility.
      if (result.unknownCount === 0) confirmedEligiblePairs++;
      else undeterminedPairs++;
    }
    if (excludedEverywhere) patientsExcludedFromAllTrials++;
  }

  const pairs = patients.length * trials.length;
  const sorted = [...unknownCounts].sort((a, b) => a - b);
  const mean =
    sorted.length === 0 ? 0 : sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const claimsOnly = byProvenance.chart === 0 && byProvenance.patient_reported === 0;
  const pct = (n: number): string => (share(n, pairs) * 100).toFixed(1);

  return {
    headline:
      `Across ${patients.length} claims-derived beneficiaries and ${trials.length} trials ` +
      `(${pairs.toLocaleString()} pairs), claims alone definitively exclude ` +
      `${pct(definitivelyExcludedPairs)}% and confirm eligibility for ` +
      `${pct(confirmedEligiblePairs)}%. The remaining ` +
      `${pct(undeterminedPairs)}% need a chart, averaging ` +
      `${mean.toFixed(1)} unresolved criteria each.` +
      (claimsOnly
        ? ""
        : " WARNING: this cohort is not claims-only, so these figures do not" +
          " describe a claims feed — see `cohort.byProvenance`."),
    cohort: {
      patients: patients.length,
      facts,
      byProvenance,
      claimsOnly,
    },
    trials: trials.length,
    pairs,
    definitivelyExcludedPairs,
    shareDefinitivelyExcluded: share(definitivelyExcludedPairs, pairs),
    patientsExcludedFromAllTrials,
    confirmedEligiblePairs,
    shareConfirmedEligible: share(confirmedEligiblePairs, pairs),
    undeterminedPairs,
    meanUnknownsPerPair: Number(mean.toFixed(3)),
    medianUnknownsPerPair: median,
    cellsByReason,
    totalCells,
  };
}
