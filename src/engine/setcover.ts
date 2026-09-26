/**
 * Batch set cover: given a budget, which tests should we order?
 *
 * A coordinator does not resolve one unknown at a time. They send a batch to the
 * lab, and the interesting structure is that one order answers several questions
 * at once — reflex NGS on an archived block settles EGFR for one patient across
 * every trial that asks about it. So the unit of work here is not a cell, it is a
 * **question about a patient**: predicate plus analyte plus drug class. Two
 * trials asking for EGFR at different thresholds share one order and the second
 * one is free.
 *
 * A patient–trial pair is *unlocked* when the plan resolves every open question
 * it has. A pair with one unknown left is not a partial win, it is still a pair
 * nobody can enrol, so partial progress earns nothing. That is what makes this
 * set cover rather than a sort.
 *
 * THE OBJECTIVE IS A PROJECTION, NOT A PREDICTION. We are choosing tests whose
 * results we do not have. `expectedPairsUnlocked` multiplies each pair's open
 * unknowns by their `pFavorable` priors, so it is what you would expect if the
 * prevalence figures hold. `pairsUnlocked` is the deterministic count — pairs
 * that will be fully *answered*, whichever way the answers come back. Both are
 * reported because they say different things, and `assumedPriors` counts the
 * unknowns that had no prior at all, so a reader can see how much of the
 * estimate is invented.
 *
 * TIER 4 IS NOT FOR SALE. A washout cannot be ordered, only waited out, so
 * tier-4 unknowns are excluded from the orderable set and any pair holding one
 * is reported under `pairsBlockedByTime` instead of being silently dropped.
 * Those pairs belong to the eligibility calendar, not to a purchase order.
 *
 * Greedy, not optimal: budgeted maximum coverage is NP-hard, and this takes the
 * best value-per-cost bundle each round. That is the standard heuristic and it
 * is the honest thing to call it on a slide.
 *
 * Pure: no clock, no I/O.
 */
import {
  TIER_LABEL,
  TIER_WEIGHT,
  type CriterionLeaf,
  type Patient,
  type Predicate,
  type Tier,
  type Trial,
} from "@/src/contracts";
import { evaluate, indexLeaves } from "./evaluate";

/** One thing to order: one question, about one patient. */
export interface TestOrder {
  key: string;
  patientId: string;
  predicate: Predicate;
  analyte?: string;
  drugClass?: string;
  tier: Tier;
  /** Tier weight. See the note on units in `planTestOrders`. */
  cost: number;
  /** Human-readable, for a worklist row. */
  label: string;
  /** Every criterion this one order answers, with the trials' own words. */
  answers: { nctId: string; criterionId: string; criterionCitation: string }[];
}

export interface UnlockedPair {
  patientId: string;
  nctId: string;
  /** Π pFavorable over the unknowns this plan resolves. */
  probability: number;
  /** How many of those unknowns had no prevalence prior and used the default. */
  assumedPriors: number;
  /** The order keys that had to be bought. */
  resolvedBy: string[];
}

export interface SetCoverPlan {
  budget: number;
  spent: number;
  orders: TestOrder[];
  unlocked: UnlockedPair[];

  /** Pairs the plan fully answers. Deterministic — no priors involved. */
  pairsUnlocked: number;
  /** Σ probability over those pairs. Depends on the priors; see the header. */
  expectedPairsUnlocked: number;

  /** Pairs with open questions the plan did not finish paying for. */
  pairsRemaining: number;
  /** Pairs already fully resolved and not eliminated, before spending anything. */
  alreadyEnrollable: number;
  /**
   * Pairs held up by a tier-4 unknown. No test unlocks these — see the
   * eligibility calendar.
   */
  pairsBlockedByTime: number;

  /** Always true. The plan assumes results come back favourably. */
  assumesFavourableResults: true;
}

export interface SetCoverOptions {
  /**
   * What to assume for an unknown with no prevalence prior. A coin flip by
   * default, which is the least informative honest choice; `assumedPriors`
   * reports how often it was needed.
   */
  defaultPFavorable?: number;
  /**
   * `expected` (the default) ranks bundles by expected pairs, using the priors.
   * `pairs` ranks by raw count, which is what to use when the prevalence data is
   * thin and you would rather not let invented priors drive the order.
   */
  objective?: "expected" | "pairs";
}

const DEFAULT_P_FAVORABLE = 0.5;

/** Tier 4 is time-bound: it cannot be bought, only waited. */
const isOrderable = (tier: Tier): boolean => tier !== 4;

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

/**
 * The identity of a test order. Two criteria that ask the same question of the
 * same patient share one, which is where the batching leverage comes from.
 */
export function orderKey(patientId: string, leaf: CriterionLeaf): string {
  return [patientId, leaf.predicate, norm(leaf.analyte), norm(leaf.drugClass)].join("|");
}

function labelFor(leaf: CriterionLeaf): string {
  const subject = leaf.analyte ?? leaf.drugClass ?? leaf.predicate.replace(/_/g, " ");
  return `${subject} — ${TIER_LABEL[leaf.tier]}`;
}

/* ------------------------------------------------------------ the candidates */

interface Requirement {
  patientId: string;
  nctId: string;
  /** Orderable keys this pair needs. */
  needs: Set<string>;
  probability: number;
  assumedPriors: number;
}

interface Draft {
  key: string;
  patientId: string;
  predicate: Predicate;
  analyte?: string;
  drugClass?: string;
  tier: Tier;
  label: string;
  answers: TestOrder["answers"];
}

/**
 * Choose a batch of test orders within `budget`.
 *
 * `budget` is in tier-weight units from `TIER_WEIGHT` (existing specimen 1,
 * blood draw 2, imaging 6, invasive 20) — deliberately not dollars. A dollar
 * figure needs a real price list, and inventing one would make the screen-failure
 * numbers fiction. Swap in a cost table when the data lane has one.
 */
export function planTestOrders(
  patients: readonly Patient[],
  trials: readonly Trial[],
  asOf: string,
  budget: number,
  options: SetCoverOptions = {},
): SetCoverPlan {
  const defaultPrior = options.defaultPFavorable ?? DEFAULT_P_FAVORABLE;
  const byExpected = (options.objective ?? "expected") === "expected";

  /** Cheapest way to answer each question, and everything it answers. */
  const drafts = new Map<string, Draft>();
  /** Tier weight per key, taking the cheapest route when trials disagree. */
  const costOf = new Map<string, number>();

  const requirements: Requirement[] = [];
  let alreadyEnrollable = 0;
  let pairsBlockedByTime = 0;

  for (const patient of patients) {
    for (const trial of trials) {
      const result = evaluate(patient, trial, asOf);
      if (result.eliminated) continue; // no test un-eliminates a decided FAIL

      const unknowns = result.cells.filter((c) => c.verdict === "UNKNOWN");
      if (unknowns.length === 0) {
        alreadyEnrollable++;
        continue;
      }
      if (unknowns.some((c) => !isOrderable(c.tier))) {
        pairsBlockedByTime++;
        continue;
      }

      const leaves = indexLeaves(trial);
      const needs = new Set<string>();
      let probability = 1;
      let assumedPriors = 0;

      for (const cell of unknowns) {
        const leaf = leaves.get(cell.criterionId)!;
        const key = orderKey(patient.id, leaf);
        needs.add(key);

        if (cell.pFavorable === undefined) {
          assumedPriors++;
          probability *= defaultPrior;
        } else {
          probability *= cell.pFavorable;
        }

        const weight = TIER_WEIGHT[leaf.tier] ?? 1;
        const known = costOf.get(key);
        if (known === undefined || weight < known) costOf.set(key, weight);

        const draft = drafts.get(key);
        const answer = {
          nctId: trial.nctId,
          criterionId: cell.criterionId,
          criterionCitation: cell.criterionCitation,
        };
        if (draft === undefined) {
          drafts.set(key, {
            key,
            patientId: patient.id,
            predicate: leaf.predicate,
            analyte: leaf.analyte,
            drugClass: leaf.drugClass,
            tier: leaf.tier,
            label: labelFor(leaf),
            answers: [answer],
          });
        } else {
          draft.answers.push(answer);
          // Keep the cheapest tier on the draft, to match costOf.
          if ((TIER_WEIGHT[leaf.tier] ?? 1) < (TIER_WEIGHT[draft.tier] ?? 1)) {
            draft.tier = leaf.tier;
            draft.label = labelFor(leaf);
          }
        }
      }

      requirements.push({
        patientId: patient.id,
        nctId: trial.nctId,
        needs,
        probability,
        assumedPriors,
      });
    }
  }

  const valueOf = (r: Requirement): number => (byExpected ? r.probability : 1);
  const priceOf = (keys: readonly string[]): number =>
    keys.reduce((sum, k) => sum + (costOf.get(k) ?? 1), 0);

  /* ------------------------------------------------------------- the greedy */

  const chosen = new Set<string>();
  const unlocked: UnlockedPair[] = [];
  let remaining = requirements.slice();
  let spent = 0;

  for (;;) {
    let best:
      | { needed: string[]; cost: number; ratio: number; harvest: Requirement[]; r: Requirement }
      | undefined;

    for (const r of remaining) {
      const needed = [...r.needs].filter((k) => !chosen.has(k)).sort();
      const cost = priceOf(needed);
      if (spent + cost > budget) continue;

      // Everything this bundle finishes off, not just the pair we priced it for.
      // This is where a shared order pays for itself twice.
      const withBundle = new Set([...chosen, ...needed]);
      const harvest = remaining.filter((q) => [...q.needs].every((k) => withBundle.has(k)));
      const gain = harvest.reduce((sum, q) => sum + valueOf(q), 0);
      const ratio = cost === 0 ? Number.POSITIVE_INFINITY : gain / cost;

      const better =
        best === undefined ||
        ratio > best.ratio ||
        (ratio === best.ratio &&
          (cost < best.cost ||
            (cost === best.cost &&
              (r.patientId < best.r.patientId ||
                (r.patientId === best.r.patientId && r.nctId < best.r.nctId)))));
      if (better) best = { needed, cost, ratio, harvest, r };
    }

    if (best === undefined || best.harvest.length === 0) break;

    for (const key of best.needed) chosen.add(key);
    spent += best.cost;

    const harvested = new Set(best.harvest);
    for (const q of best.harvest) {
      unlocked.push({
        patientId: q.patientId,
        nctId: q.nctId,
        probability: q.probability,
        assumedPriors: q.assumedPriors,
        resolvedBy: [...q.needs].sort(),
      });
    }
    remaining = remaining.filter((q) => !harvested.has(q));
  }

  const orders = [...chosen]
    .map((key) => {
      const d = drafts.get(key)!;
      return {
        key: d.key,
        patientId: d.patientId,
        predicate: d.predicate,
        analyte: d.analyte,
        drugClass: d.drugClass,
        tier: d.tier,
        cost: costOf.get(key) ?? 1,
        label: d.label,
        // Deterministic order, so two runs produce byte-identical worklists.
        answers: [...d.answers].sort(
          (a, b) =>
            (a.nctId < b.nctId ? -1 : a.nctId > b.nctId ? 1 : 0) ||
            (a.criterionId < b.criterionId ? -1 : a.criterionId > b.criterionId ? 1 : 0),
        ),
      };
    })
    // Cheapest and most widely useful first — that is the order to send them in.
    .sort(
      (a, b) =>
        b.answers.length - a.answers.length ||
        a.cost - b.cost ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );

  unlocked.sort(
    (a, b) =>
      b.probability - a.probability ||
      (a.patientId < b.patientId ? -1 : a.patientId > b.patientId ? 1 : 0) ||
      (a.nctId < b.nctId ? -1 : a.nctId > b.nctId ? 1 : 0),
  );

  return {
    budget,
    spent,
    orders,
    unlocked,
    pairsUnlocked: unlocked.length,
    expectedPairsUnlocked: unlocked.reduce((sum, u) => sum + u.probability, 0),
    pairsRemaining: remaining.length,
    alreadyEnrollable,
    pairsBlockedByTime,
    assumesFavourableResults: true,
  };
}
