/**
 * The eligibility calendar — the one read model in this system that looks
 * forward instead of at today.
 *
 * Tier 4 is the tier you cannot buy your way out of: a washout, a waiting
 * period, time since last dose. Every other unknown is a test someone can
 * order. A tier-4 criterion that blocks a patient today resolves itself on a
 * date that is already computable from the record — and nothing in trial
 * matching is forward-looking, so a coordinator who wants to know "who becomes
 * enrollable next month" has no way to ask. This is that answer.
 *
 * It is also where the clock gets dangerous, so: no clock. `asOf` is today and
 * every projected date is derived from it and from `observedAt` dates in the
 * record. Same inputs, same calendar, forever.
 *
 * HOW A DATE IS FOUND. Verdicts only change on the days a threshold is crossed,
 * so the candidate dates are a small, exact, enumerable set — the crossing dates
 * of the trial's own tier-4 leaves. We walk them in order and re-run the real
 * `evaluate()` at each. Nothing here re-implements the scoring rules, which
 * means the calendar cannot drift from the criteria table.
 *
 * WHAT IT REFUSES TO CLAIM. Evaluating at a future date also makes today's fresh
 * labs stale, and a stale exclusion stops firing — so a patient can become
 * "eligible" in three weeks purely because the evidence against them decayed.
 * That is not a waiting period completing, it is our record-keeping rotting, and
 * putting it on a calendar labelled "becomes eligible" would be a lie. Every
 * candidate date is checked against exactly that: we undo the decay and ask
 * whether the patient would still be eliminated. If the answer is yes, the date
 * is dropped. Decay is reported instead, as `newlyStaleCriterionIds` — the work
 * that will need redoing by then.
 */
import {
  type CriterionLeaf,
  type CubeCell,
  type Patient,
  type Trial,
} from "@/src/contracts";
import {
  eliminatedFromCells,
  evaluate,
  indexLeaves,
  matchingFacts,
} from "./evaluate";
import { addDays, daysBetween, parseIsoDate } from "./time";

/** One patient becoming enrollable in one trial on one date. */
export interface CalendarEntry {
  patientId: string;
  nctId: string;

  /** ISO calendar date, always after `asOf`. */
  becomesEligibleOn: string;
  daysFromAsOf: number;

  /** The time-bound criteria we are waiting on, and the trial's words for them. */
  gatingCriterionIds: string[];
  gatingCitations: string[];

  /** Unknowns still open on that date — the work that does not resolve itself. */
  unknownCountOnDate: number;

  /**
   * Criteria that are settled today but will have aged out by then. A redraw,
   * not a surprise — this is the list the coordinator schedules.
   */
  newlyStaleCriterionIds: string[];

  /** From the `closesOn` lookup, when one was supplied. */
  trialClosesOn?: string;

  /**
   * The trial stops enrolling before this patient can join. The point of the
   * exhibit: a waiting period that outlasts the trial is a silent no.
   */
  closesBeforeEligible: boolean;
}

export interface CalendarOptions {
  /**
   * Enrollment close dates by `nctId`. `Trial` has no such field — it is frozen
   * — so the date has to come in from outside. The compiler lane has it in the
   * cached registry records. Without it, `closesBeforeEligible` is always false
   * and the calendar simply does not make that claim.
   */
  closesOn?: Readonly<Record<string, string>>;

  /**
   * How far ahead to look, in days. A year by default: past that the record is
   * too stale to project from and the answer would be fiction.
   */
  horizonDays?: number;
}

const DEFAULT_HORIZON_DAYS = 365;

/** Tier 4 is the time-bound tier. That is what makes a criterion projectable. */
const isTimeBound = (leaf: CriterionLeaf): boolean => leaf.tier === 4;

/**
 * The days on which a time-bound leaf's verdict can change, for one patient.
 *
 * A washout fact is a date — the last dose — and the leaf is a number of days.
 * The verdict turns over on `lastDose + N`, and for a strict comparison one day
 * later, so both are offered and `evaluate()` decides which one actually counts.
 * Guessing which boundary a given operator needs is how off-by-one bugs get into
 * a schedule a nurse reads.
 */
export function timeBoundCrossings(
  trial: Trial,
  patient: Patient,
  asOf: string,
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): string[] {
  const horizonEnd = addDays(asOf, horizonDays);
  if (horizonEnd === null) {
    throw new TypeError(`calendar: asOf is not a valid ISO date: ${JSON.stringify(asOf)}`);
  }

  const dates = new Set<string>();
  for (const leaf of indexLeaves(trial).values()) {
    if (!isTimeBound(leaf)) continue;
    const threshold = typeof leaf.value === "number" ? leaf.value : Number(leaf.value);
    if (!Number.isFinite(threshold)) continue;

    for (const fact of matchingFacts(leaf, patient)) {
      // Only a date-valued fact can be projected. A fact that already holds a
      // day count is a snapshot of an elapsed period and says nothing about when
      // it will reach the threshold.
      if (typeof fact.value !== "string" || parseIsoDate(fact.value) === null) continue;

      for (const offset of [threshold, threshold + 1]) {
        const when = addDays(fact.value, offset);
        if (when === null) continue;
        if (when > asOf && when <= horizonEnd) dates.add(when);
      }
    }
  }
  return [...dates].sort();
}

/**
 * Would this patient still be eliminated on `date` if nothing had gone stale?
 *
 * Takes the cube at `date`, puts back every cell that only turned UNKNOWN
 * because a fact aged out, and re-rolls. True means the un-elimination was
 * caused by decay rather than by a waiting period ending, so the date is not a
 * real eligibility date.
 */
function unelimitedOnlyByDecay(
  trial: Trial,
  atAsOf: readonly CubeCell[],
  atDate: readonly CubeCell[],
): boolean {
  const before = new Map(atAsOf.map((c) => [c.criterionId, c]));
  const merged = new Map(atDate.map((c) => [c.criterionId, c]));

  for (const cell of atDate) {
    const was = before.get(cell.criterionId);
    if (cell.reason === "stale" && was !== undefined && was.reason !== "stale") {
      merged.set(cell.criterionId, was);
    }
  }
  return eliminatedFromCells(trial, merged);
}

/**
 * The forward schedule: who becomes enrollable where, and when.
 *
 * Only patients eliminated today appear. Anyone eligible now belongs on today's
 * worklist, not on a calendar. Sorted by date, then trial, then patient.
 */
export function calendar(
  patients: readonly Patient[],
  trials: readonly Trial[],
  asOf: string,
  options: CalendarOptions = {},
): CalendarEntry[] {
  const horizonDays = options.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const closesOn = options.closesOn ?? {};
  const entries: CalendarEntry[] = [];

  for (const patient of patients) {
    for (const trial of trials) {
      const today = evaluate(patient, trial, asOf);
      if (!today.eliminated) continue;

      const leaves = indexLeaves(trial);
      const before = new Map(today.cells.map((c) => [c.criterionId, c]));

      for (const date of timeBoundCrossings(trial, patient, asOf, horizonDays)) {
        const then = evaluate(patient, trial, date);
        if (then.eliminated) continue;
        if (unelimitedOnlyByDecay(trial, today.cells, then.cells)) continue;

        // What actually moved, and what rotted, between today and that date.
        const gating: string[] = [];
        const newlyStale: string[] = [];
        for (const cell of then.cells) {
          const was = before.get(cell.criterionId);
          if (was === undefined) continue;
          if (cell.reason === "stale" && was.reason !== "stale") {
            newlyStale.push(cell.criterionId);
          }
          if (cell.verdict !== was.verdict && isTimeBound(leaves.get(cell.criterionId)!)) {
            gating.push(cell.criterionId);
          }
        }

        const trialClosesOn = closesOn[trial.nctId];
        entries.push({
          patientId: patient.id,
          nctId: trial.nctId,
          becomesEligibleOn: date,
          daysFromAsOf: daysBetween(asOf, date)!,
          gatingCriterionIds: gating,
          // The trial's own words for what we are waiting on. A calendar row is
          // still a claim about a protocol, so it still carries its citation.
          gatingCitations: gating.map((id) => leaves.get(id)!.sourceSpan),
          unknownCountOnDate: then.unknownCount,
          newlyStaleCriterionIds: newlyStale,
          trialClosesOn,
          closesBeforeEligible: trialClosesOn !== undefined && trialClosesOn < date,
        });
        break; // the earliest date is the answer
      }
    }
  }

  return entries.sort(
    (a, b) =>
      (a.becomesEligibleOn < b.becomesEligibleOn ? -1 : a.becomesEligibleOn > b.becomesEligibleOn ? 1 : 0) ||
      (a.nctId < b.nctId ? -1 : a.nctId > b.nctId ? 1 : 0) ||
      (a.patientId < b.patientId ? -1 : a.patientId > b.patientId ? 1 : 0),
  );
}

/**
 * The entries a coordinator can still act on — the trial is open long enough.
 * Kept separate rather than filtered inside `calendar()`, because the ones that
 * close too early are the finding, not noise.
 */
export function actionableEntries(entries: readonly CalendarEntry[]): CalendarEntry[] {
  return entries.filter((e) => !e.closesBeforeEligible);
}
