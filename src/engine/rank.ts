/**
 * The worklist order. Pure, total, and deterministic down to the last tie.
 *
 * Eliminated pairs are dropped, not sorted to the bottom — a coordinator's
 * worklist is a list of people to act on, and "ineligible" is not an action.
 * Then, in order:
 *
 *   1. fewest unknowns      — closest to an answer
 *   2. highest expectedValue — best use of the next test
 *   3. shortest travel       — cheapest for the patient
 *
 * Unknowns come first rather than expectedValue because the product's promise is
 * "here is what is missing": a pair with one open question is a phone call, and
 * a pair with nine is a project, however promising each question looks.
 *
 * The same comparator orders both axes of the cube: a patient's trials, and a
 * trial's candidate patients. The matching in match.ts reuses it directly, so
 * trial preferences and worklist order can never drift apart.
 */
import type { PairResult, Patient, Trial } from "@/src/contracts";
import { evaluate, type EvaluateOptions } from "./evaluate";

/**
 * Where travel time comes from. Pass whichever side of the cube you have; the
 * comparator degrades gracefully when neither knows.
 */
export interface RankContext {
  patients?: readonly Patient[];
  trials?: readonly Trial[];
}

/**
 * Minutes from this patient to this trial's site.
 *
 * A trial's own `siteDistanceMinutes` wins when present, because it is specific
 * to that site; `Patient.travelMinutes` is a general burden and is the fallback.
 * Unknown travel sorts last — we will not promote a trial for being silent
 * about its distance.
 */
export function travelMinutesFor(
  patient: Patient | undefined,
  trial: Trial | undefined,
): number {
  return trial?.siteDistanceMinutes ?? patient?.travelMinutes ?? Number.POSITIVE_INFINITY;
}

/** Resolves travel for a result, and gives a stable answer when lookups miss. */
function travelResolver(ctx: RankContext): (r: PairResult) => number {
  const patients = new Map((ctx.patients ?? []).map((p) => [p.id, p]));
  const trials = new Map((ctx.trials ?? []).map((t) => [t.nctId, t]));
  return (r) => travelMinutesFor(patients.get(r.patientId), trials.get(r.nctId));
}

/**
 * The comparator itself. Negative when `a` should come first.
 *
 * Ends on ids so the order is total: two pairs that tie on every substantive
 * key still sort the same way on every machine and every run, which is what
 * makes the stable matching reproducible and the fixtures assertable.
 */
export function compareCandidates(
  a: PairResult,
  b: PairResult,
  travel: (r: PairResult) => number,
): number {
  if (a.unknownCount !== b.unknownCount) return a.unknownCount - b.unknownCount;
  if (a.expectedValue !== b.expectedValue) return b.expectedValue - a.expectedValue;

  const ta = travel(a);
  const tb = travel(b);
  if (ta !== tb) return ta - tb;

  if (a.nctId !== b.nctId) return a.nctId < b.nctId ? -1 : 1;
  if (a.patientId !== b.patientId) return a.patientId < b.patientId ? -1 : 1;
  return 0;
}

/**
 * Drop the eliminated, order the rest. Does not mutate its input — the cube is
 * shared by every read model and none of them may reorder it for the others.
 */
export function rank(results: readonly PairResult[], ctx: RankContext = {}): PairResult[] {
  const travel = travelResolver(ctx);
  return results.filter((r) => !r.eliminated).sort((a, b) => compareCandidates(a, b, travel));
}

/** The oncologist's view: this patient's trials, best first. */
export function rankTrialsForPatient(
  patient: Patient,
  trials: readonly Trial[],
  asOf: string,
  options?: EvaluateOptions,
): PairResult[] {
  return rank(
    trials.map((t) => evaluate(patient, t, asOf, options)),
    { patients: [patient], trials },
  );
}

/** The coordinator's worklist: this trial's candidates, best first. */
export function rankPatientsForTrial(
  trial: Trial,
  patients: readonly Patient[],
  asOf: string,
  options?: EvaluateOptions,
): PairResult[] {
  return rank(
    patients.map((p) => evaluate(p, trial, asOf, options)),
    { patients, trials: [trial] },
  );
}
