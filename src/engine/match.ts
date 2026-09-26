/**
 * Market clearing. Gale–Shapley, many-to-one, capacity = `trial.slots`.
 *
 * Screening one patient at a time produces a first-come allocation: whoever is
 * screened on Tuesday takes the slot, and a better-matched patient screened on
 * Friday finds it gone. Both sides can end up wishing they had each other,
 * which is a blocking pair, and `unstablePairs` counts them. Gale–Shapley with
 * patients proposing drives that count to zero and is patient-optimal among
 * stable matchings — of all the ways to clear this market with no blocking
 * pair, every patient does at least as well as in any other.
 *
 * Preferences:
 *   trials rank patients — rank.ts order, so a trial's preferences and the
 *     coordinator's worklist are the same object and cannot drift apart
 *   patients rank trials — travel first, then phase
 *
 * Eliminated pairs are unacceptable to both sides and never enter the market.
 * An UNKNOWN does not make a pair unacceptable: a patient with open questions
 * is a candidate, which is the entire point (rule 4).
 *
 * Pure: no clock, no I/O, and the cube is evaluated once up front.
 */
import type { Assignment, PairResult, Patient, Trial } from "@/src/contracts";
import { evaluate } from "./evaluate";
import type { PriorTable } from "./priors";
import { compareCandidates, travelMinutesFor } from "./rank";

export interface MatchOptions {
  /**
   * Cited prevalence priors. Trials rank patients with rank.ts's comparator,
   * which breaks ties on expectedValue, so priors change who gets the slot.
   */
  priors?: PriorTable;

  /**
   * DAP-constrained mode. When a trial is at capacity, let a proposer from a
   * subgroup below the sponsor's Diversity Action Plan target displace a held
   * patient from a subgroup already at or above its target, even though the
   * held patient ranks higher.
   *
   * This deliberately gives up strict stability — the constraint overrules
   * preference, so `unstablePairs` can come back non-zero. That number is the
   * exhibit: it is the price, in blocking pairs, of hitting the targets, and it
   * is usually far smaller than anyone expects.
   */
  dapTargets?: boolean;

  /**
   * How patients break a travel tie. `later` (the default) prefers the
   * higher-numbered phase, on the reasoning that a later-phase agent has more
   * evidence behind it. Flip it to `earlier` for a cohort seeking novel agents
   * after progression. It is a preference model, not a clinical claim, and the
   * demo should say which one is switched on.
   */
  phasePreference?: "later" | "earlier";
}

/**
 * "PHASE3" → 3, "EARLY_PHASE1" → 0.5, "PHASE2/PHASE3" → 3, anything else → 0.
 * A combined phase is ranked by its highest arm, and an unlabelled phase sorts
 * last rather than being guessed at.
 */
export function phaseRank(phase: string): number {
  const digits = [...phase.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (digits.length === 0) return 0;
  const top = Math.max(...digits);
  return /early/i.test(phase) && top === 1 ? 0.5 : top;
}

/* --------------------------------------------------------------- preferences */

interface Market {
  /** Every evaluated pair, by `patientId|nctId`. */
  results: Map<string, PairResult>;
  /** Trials each patient will accept, best first. */
  patientPrefs: Map<string, string[]>;
  /** Each trial's ranking of patients it will accept: patientId → position. */
  trialRanks: Map<string, Map<string, number>>;
}

const key = (patientId: string, nctId: string): string => `${patientId}|${nctId}`;

function buildMarket(
  patients: readonly Patient[],
  trials: readonly Trial[],
  asOf: string,
  options: MatchOptions,
): Market {
  const results = new Map<string, PairResult>();
  for (const p of patients) {
    for (const t of trials) {
      results.set(key(p.id, t.nctId), evaluate(p, t, asOf, { priors: options.priors }));
    }
  }

  const byId = new Map(patients.map((p) => [p.id, p]));
  const byNct = new Map(trials.map((t) => [t.nctId, t]));
  const direction = options.phasePreference === "earlier" ? 1 : -1;

  const patientPrefs = new Map<string, string[]>();
  for (const p of patients) {
    const acceptable = trials.filter(
      (t) => t.slots > 0 && !results.get(key(p.id, t.nctId))!.eliminated,
    );
    patientPrefs.set(
      p.id,
      acceptable
        .slice()
        .sort((a, b) => {
          const ta = travelMinutesFor(p, a);
          const tb = travelMinutesFor(p, b);
          if (ta !== tb) return ta - tb;
          const pa = phaseRank(a.phase);
          const pb = phaseRank(b.phase);
          if (pa !== pb) return direction * (pa - pb);
          return a.nctId < b.nctId ? -1 : a.nctId > b.nctId ? 1 : 0;
        })
        .map((t) => t.nctId),
    );
  }

  const trialRanks = new Map<string, Map<string, number>>();
  for (const t of trials) {
    // Exactly rank.ts order: same comparator as the coordinator's worklist.
    const ordered = patients
      .map((p) => results.get(key(p.id, t.nctId))!)
      .filter((r) => !r.eliminated)
      .sort((a, b) =>
        compareCandidates(a, b, (r) => travelMinutesFor(byId.get(r.patientId), byNct.get(r.nctId))),
      );
    trialRanks.set(t.nctId, new Map(ordered.map((r, i) => [r.patientId, i])));
  }

  return { results, patientPrefs, trialRanks };
}

/* ---------------------------------------------------------------- DAP support */

/**
 * Would the DAP constraint have this trial swap `proposer` in for `worstHeld`?
 *
 * A subgroup with no stated target is treated as target 0, so any seat it holds
 * counts as at-or-above target and is displaceable by an under-target
 * proposer. That is aggressive, and it is what a hard target means: the shares
 * the sponsor committed to come first, and everything else is the remainder.
 */
function dapPrefers(
  trial: Trial,
  heldRaces: readonly string[],
  proposerRace: string,
  worstHeldRace: string,
): boolean {
  const targets = trial.dapTargets;
  if (targets === undefined || proposerRace === worstHeldRace) return false;
  if (trial.slots <= 0) return false;

  const shareOf = (race: string): number =>
    heldRaces.filter((r) => r === race).length / trial.slots;

  const proposerTarget = targets[proposerRace];
  if (proposerTarget === undefined || shareOf(proposerRace) >= proposerTarget) return false;

  const worstTarget = targets[worstHeldRace] ?? 0;
  return shareOf(worstHeldRace) >= worstTarget;
}

/* ------------------------------------------------------------------ matching */

/** Held seats per trial, as patient ids in no particular order. */
type Held = Map<string, string[]>;

function worstHeldIn(held: string[], ranks: Map<string, number>): string {
  return held.reduce((worst, id) =>
    (ranks.get(id) ?? Infinity) > (ranks.get(worst) ?? Infinity) ? id : worst,
  );
}

/**
 * Deferred acceptance. Patients propose in preference order; a trial holds its
 * best `slots` proposals so far and releases anyone it later prefers to drop.
 */
function deferredAcceptance(
  market: Market,
  patients: readonly Patient[],
  trials: readonly Trial[],
  options: MatchOptions,
): Held {
  const byNct = new Map(trials.map((t) => [t.nctId, t]));
  const raceOf = new Map(patients.map((p) => [p.id, p.race]));
  const held: Held = new Map(trials.map((t) => [t.nctId, []]));

  /** How far down their own list each patient has already proposed. */
  const nextProposal = new Map(patients.map((p) => [p.id, 0]));
  const free: string[] = patients.map((p) => p.id);

  while (free.length > 0) {
    const patientId = free.shift()!;
    const prefs = market.patientPrefs.get(patientId)!;
    const cursor = nextProposal.get(patientId)!;
    if (cursor >= prefs.length) continue; // out of acceptable trials; stays unmatched

    const nctId = prefs[cursor];
    nextProposal.set(patientId, cursor + 1);

    const trial = byNct.get(nctId)!;
    const ranks = market.trialRanks.get(nctId)!;
    if (!ranks.has(patientId)) {
      free.push(patientId); // unacceptable to this trial; try the next one
      continue;
    }

    const seats = held.get(nctId)!;
    if (seats.length < trial.slots) {
      seats.push(patientId);
      continue;
    }

    const worst = worstHeldIn(seats, ranks);
    const outranksWorst = (ranks.get(patientId) ?? Infinity) < (ranks.get(worst) ?? Infinity);
    const dapSwap =
      options.dapTargets === true &&
      dapPrefers(
        trial,
        seats.map((id) => raceOf.get(id)!),
        raceOf.get(patientId)!,
        raceOf.get(worst)!,
      );

    if (outranksWorst || dapSwap) {
      // The proposer takes the seat; the displaced patient goes back to the
      // queue and carries on down their own list.
      held.set(nctId, [...seats.filter((id) => id !== worst), patientId]);
      free.push(worst);
    } else {
      free.push(patientId); // rejected here, but not out of the market
    }
  }

  return held;
}

/* ------------------------------------------------------------------ stability */

/**
 * Blocking pairs: a patient and a trial who would both rather have each other
 * than what they got. Zero means the matching is stable.
 */
function countUnstablePairs(
  market: Market,
  patients: readonly Patient[],
  trials: readonly Trial[],
  held: Held,
): number {
  const assignedTo = new Map<string, string>();
  for (const [nctId, seats] of held) {
    for (const id of seats) assignedTo.set(id, nctId);
  }

  let blocking = 0;
  for (const p of patients) {
    const prefs = market.patientPrefs.get(p.id)!;
    const current = assignedTo.get(p.id);
    const currentIndex = current === undefined ? prefs.length : prefs.indexOf(current);

    for (const t of trials) {
      if (t.nctId === current) continue;
      const wants = prefs.indexOf(t.nctId);
      if (wants === -1 || wants >= currentIndex) continue; // not an improvement

      const ranks = market.trialRanks.get(t.nctId)!;
      if (!ranks.has(p.id)) continue; // unacceptable to the trial
      const seats = held.get(t.nctId)!;

      const trialWouldTake =
        seats.length < t.slots ||
        (ranks.get(p.id) ?? Infinity) < (ranks.get(worstHeldIn(seats, ranks)) ?? Infinity);

      if (trialWouldTake) blocking++;
    }
  }
  return blocking;
}

/* -------------------------------------------------------------------- results */

function assemble(
  mode: Assignment["mode"],
  market: Market,
  patients: readonly Patient[],
  trials: readonly Trial[],
  held: Held,
): Assignment {
  const byId = new Map(patients.map((p) => [p.id, p]));
  const byNct = new Map(trials.map((t) => [t.nctId, t]));

  // Trial-major in input order, then by the trial's own ranking, so the output
  // reads like a worklist and is byte-identical run to run.
  const pairs: { patientId: string; nctId: string }[] = [];
  for (const t of trials) {
    const ranks = market.trialRanks.get(t.nctId)!;
    const seats = [...(held.get(t.nctId) ?? [])].sort(
      (a, b) => (ranks.get(a) ?? Infinity) - (ranks.get(b) ?? Infinity),
    );
    for (const patientId of seats) pairs.push({ patientId, nctId: t.nctId });
  }

  const travels = pairs
    .map((pair) => travelMinutesFor(byId.get(pair.patientId), byNct.get(pair.nctId)))
    .filter(Number.isFinite);
  const meanTravelMinutes =
    travels.length === 0
      ? 0
      : Number((travels.reduce((a, b) => a + b, 0) / travels.length).toFixed(1));

  const subgroupShare: Record<string, number> = {};
  if (pairs.length > 0) {
    for (const pair of pairs) {
      const race = byId.get(pair.patientId)!.race;
      subgroupShare[race] = (subgroupShare[race] ?? 0) + 1 / pairs.length;
    }
  }

  return {
    mode,
    pairs,
    enrolled: pairs.length,
    meanTravelMinutes,
    unstablePairs: countUnstablePairs(market, patients, trials, held),
    subgroupShare,
  };
}

/**
 * Stable many-to-one matching of patients to trials.
 *
 * `mode` comes back as `stable`, or `stable_dap` when the DAP constraint is on.
 */
export function match(
  patients: readonly Patient[],
  trials: readonly Trial[],
  asOf: string,
  options: MatchOptions = {},
): Assignment {
  const market = buildMarket(patients, trials, asOf, options);
  const held = deferredAcceptance(market, patients, trials, options);
  return assemble(
    options.dapTargets === true ? "stable_dap" : "stable",
    market,
    patients,
    trials,
    held,
  );
}

/**
 * The baseline the demo compares against: first-come screening. Patients are
 * offered slots in cohort order and take their own best available trial, with
 * no reconsideration. Its `unstablePairs` is the number `match()` removes.
 */
export function matchAdhoc(
  patients: readonly Patient[],
  trials: readonly Trial[],
  asOf: string,
  options: MatchOptions = {},
): Assignment {
  const market = buildMarket(patients, trials, asOf, options);
  const byNct = new Map(trials.map((t) => [t.nctId, t]));
  const held: Held = new Map(trials.map((t) => [t.nctId, []]));

  for (const p of patients) {
    for (const nctId of market.patientPrefs.get(p.id)!) {
      if (!market.trialRanks.get(nctId)!.has(p.id)) continue;
      const seats = held.get(nctId)!;
      if (seats.length >= byNct.get(nctId)!.slots) continue;
      seats.push(p.id);
      break;
    }
  }

  return assemble("adhoc", market, patients, trials, held);
}

/**
 * Blocking pairs in an assignment somebody else produced.
 *
 * `match()` already reports its own, but an assignment can arrive from anywhere —
 * a coordinator's spreadsheet, last month's enrolment, a competing algorithm —
 * and the interesting question about it is how many patient/trial pairs would
 * both rather have each other. Zero means it could not be improved by any swap.
 *
 * Takes the same preference model as `match`, so the answer is comparable with
 * the one `match` reports rather than a differently-defined number.
 */
export function countBlockingPairs(
  patients: readonly Patient[],
  trials: readonly Trial[],
  asOf: string,
  pairs: readonly { patientId: string; nctId: string }[],
  options: MatchOptions = {},
): number {
  const market = buildMarket(patients, trials, asOf, options);
  const held: Held = new Map(trials.map((t) => [t.nctId, []]));
  for (const pair of pairs) {
    const seats = held.get(pair.nctId);
    if (seats === undefined) {
      throw new Error(`countBlockingPairs: no trial ${pair.nctId} in the pool.`);
    }
    seats.push(pair.patientId);
  }
  return countUnstablePairs(market, patients, trials, held);
}
