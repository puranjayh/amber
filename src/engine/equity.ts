/**
 * The equity audit: which criteria exclude some groups more than others.
 *
 * The denominator is the whole argument. It is not "all patients" and it is not
 * "all patients of this race" — it is **otherwise-eligible** patients: those who
 * would be candidates if this one criterion were relaxed. Rates over the full
 * cohort would mostly measure who has which disease, and every criterion would
 * look discriminatory. Rates over the otherwise-eligible isolate the question
 * worth asking: among people this trial could otherwise take, does this
 * criterion fall unevenly?
 *
 * That is also the FDORA 2022 Diversity Action Plan question. A sponsor who
 * cannot hit a DAP target wants to know which line of their own protocol is
 * costing them, and this is the table that says so.
 *
 * A subgroup with no otherwise-eligible patients is left out of the row rather
 * than recorded as 0%. Zero of zero is not "this criterion is harmless here",
 * it is "we cannot say", and 0% would be read off the screen as the former.
 *
 * Pure: no clock, no I/O, and the cube is evaluated once per patient.
 */
import type { CriterionLeaf, CubeCell, EquityRow, Patient, Trial } from "@/src/contracts";
import { eliminatedFromCells, evaluate, indexLeaves } from "./evaluate";

/** Percentage points, to one decimal — enough for a table, no float noise. */
function gapPoints(rates: readonly number[]): number {
  if (rates.length < 2) return 0;
  return Number(((Math.max(...rates) - Math.min(...rates)) * 100).toFixed(1));
}

interface Screened {
  patient: Patient;
  byId: Map<string, CubeCell>;
  eliminated: boolean;
}

function screen(trial: Trial, patients: readonly Patient[], asOf: string): Screened[] {
  return patients.map((patient) => {
    const result = evaluate(patient, trial, asOf);
    return {
      patient,
      byId: new Map(result.cells.map((c) => [c.criterionId, c])),
      eliminated: result.eliminated,
    };
  });
}

/**
 * One row per criterion of one trial.
 *
 * `criterionId` and `label` carry the criterion's id and the trial's own words,
 * so a row on screen is still a citation.
 */
export function equityAudit(
  trial: Trial,
  patients: readonly Patient[],
  asOf: string,
): EquityRow[] {
  return rowsFor([{ trial, screened: screen(trial, patients, asOf) }], (l) => l.id);
}

/**
 * The audit across a pool of trials. Criterion ids are namespaced by trial,
 * because `EXC-1` means something different in every protocol and collapsing
 * them would average unrelated criteria together.
 */
export function equityAuditAcross(
  trials: readonly Trial[],
  patients: readonly Patient[],
  asOf: string,
): EquityRow[] {
  return rowsFor(
    trials.map((trial) => ({ trial, screened: screen(trial, patients, asOf) })),
    (l, t) => `${t.nctId}:${l.id}`,
  );
}

function rowsFor(
  scope: readonly { trial: Trial; screened: Screened[] }[],
  idOf: (leaf: CriterionLeaf, trial: Trial) => string,
): EquityRow[] {
  const rows: EquityRow[] = [];

  for (const { trial, screened } of scope) {
    for (const leaf of indexLeaves(trial).values()) {
      /** Per subgroup: how many were otherwise eligible, and how many this cost. */
      const tally = new Map<string, { otherwiseEligible: number; excluded: number }>();

      for (const { patient, byId, eliminated } of screened) {
        const cell = byId.get(leaf.id);
        if (cell === undefined) continue; // partial cube; nothing to attribute

        // Neutralise just this criterion and ask whether the patient survives.
        const relaxed = new Map(byId);
        relaxed.set(leaf.id, { ...cell, verdict: "UNKNOWN" });
        if (eliminatedFromCells(trial, relaxed)) continue; // something else excludes them

        const bucket = tally.get(patient.race) ?? { otherwiseEligible: 0, excluded: 0 };
        bucket.otherwiseEligible++;
        // Otherwise eligible but eliminated in fact: this criterion did it.
        if (eliminated) bucket.excluded++;
        tally.set(patient.race, bucket);
      }

      const exclusionRateBySubgroup: Record<string, number> = {};
      for (const group of [...tally.keys()].sort()) {
        const { otherwiseEligible, excluded } = tally.get(group)!;
        if (otherwiseEligible === 0) continue; // a rate over nobody is not a rate
        exclusionRateBySubgroup[group] = excluded / otherwiseEligible;
      }

      rows.push({
        criterionId: idOf(leaf, trial),
        label: leaf.sourceSpan,
        exclusionRateBySubgroup,
        maxGapPoints: gapPoints(Object.values(exclusionRateBySubgroup)),
      });
    }
  }

  // Widest gap first. Ties fall back to the id so the table is reproducible.
  return rows.sort((a, b) =>
    b.maxGapPoints !== a.maxGapPoints
      ? b.maxGapPoints - a.maxGapPoints
      : a.criterionId < b.criterionId
        ? -1
        : a.criterionId > b.criterionId
          ? 1
          : 0,
  );
}
