/**
 * The claims-answerability gap.
 *
 * One number, and it is the most valuable thing this engine computes for a payer
 * audience: what share of real trial eligibility criteria can be settled from
 * administrative claims, and what share needs somebody to open a chart.
 *
 * Nobody can state this today, because stating it requires eligibility criteria
 * compiled into something machine-readable at scale. We have that, so we can size
 * it — over a whole trial pool, without touching a single patient record. That
 * last part matters: this is a statement about protocols, not about people, so it
 * carries no privacy burden at all and can be published as-is.
 *
 * HOW THE HEADLINE STAYS DEFENSIBLE. Three buckets, from `answerableBy`: `yes`,
 * `sometimes`, `never`. The headline share counts **only `yes`**, and everything
 * else — including every `sometimes` — falls into "requires a chart". That makes
 * the claim deliberately conservative: the true answerable share is at least the
 * number we quote and possibly higher, so the sentence cannot be attacked by
 * arguing about the ambiguous middle. `shareAnswerableOptimistic` is reported
 * alongside for anyone who wants the upper bound, but it is not the headline.
 *
 * Pure: takes trials, returns a report. The caller does the file I/O.
 */
import type { CriterionLeaf, Predicate, Trial } from "@/src/contracts";
import { allLeaves, duplicateLeafIds } from "./evaluate";
import { answerableBy, type Answerability, type Provenance } from "./provenance";

export interface CoverageTally {
  criteria: number;
  yes: number;
  sometimes: number;
  never: number;
  /** yes / criteria. The conservative share, and the one in the headline. */
  shareAnswerable: number;
  /** (yes + sometimes) / criteria. The upper bound, never the headline. */
  shareAnswerableOptimistic: number;
  /** (sometimes + never) / criteria — "requires a chart". */
  shareRequiringChart: number;
}

export interface TrialCoverage extends CoverageTally {
  nctId: string;
  title: string;
  phase: string;
  /** Excluded from the demo pool by validation or back-translation (rule 5). */
  needsHumanReview: boolean;
}

export interface CoverageReport {
  /** The sentence for the slide. Generated, so it cannot drift from the data. */
  headline: string;
  /** Why the headline counts what it counts. */
  headlineBasis: string;

  provenance: Provenance;
  trials: number;
  overall: CoverageTally;

  byPredicate: { predicate: Predicate; tally: CoverageTally }[];
  byType: { type: "inclusion" | "exclusion"; tally: CoverageTally }[];
  perTrial: TrialCoverage[];

  /**
   * How the per-trial answerable share is spread, in ten-point bands. The
   * average hides the shape: a pool where every trial is at 50% and a pool where
   * half are at 0% and half at 100% have the same mean and mean very different
   * things for a screening product.
   */
  distribution: { band: string; trials: number }[];

  /** Trials with no compiled criteria at all, excluded from every share above. */
  trialsWithoutCriteria: string[];

  /**
   * Trials whose compiler emitted the same criterion id twice. Counted here in
   * full, but the engine's roll-up looks cells up by id, so these need fixing
   * upstream — see `duplicateLeafIds`.
   */
  trialsWithDuplicateCriterionIds: { nctId: string; ids: Record<string, number> }[];
}

const PREDICATE_ORDER: Predicate[] = [
  "age",
  "diagnosis",
  "staging",
  "prior_therapy",
  "comorbidity",
  "contraindication",
  "washout",
  "performance_status",
  "lab_value",
  "biomarker",
];

const emptyCounts = (): { yes: number; sometimes: number; never: number } => ({
  yes: 0,
  sometimes: 0,
  never: 0,
});

function tallyOf(counts: { yes: number; sometimes: number; never: number }): CoverageTally {
  const criteria = counts.yes + counts.sometimes + counts.never;
  const share = (n: number): number => (criteria === 0 ? 0 : Number((n / criteria).toFixed(6)));
  return {
    criteria,
    ...counts,
    shareAnswerable: share(counts.yes),
    shareAnswerableOptimistic: share(counts.yes + counts.sometimes),
    shareRequiringChart: share(counts.sometimes + counts.never),
  };
}

const pct = (share: number): string => (share * 100).toFixed(1);

/** Ten-point band a share falls in, with 100% kept out of a phantom 11th band. */
function bandOf(share: number): string {
  const lower = Math.min(90, Math.floor(share * 10) * 10);
  return `${lower}-${lower + 10}%`;
}

export interface CoverageOptions {
  /** Which source we are sizing. Defaults to `claims`, the interesting one. */
  provenance?: Provenance;
  /**
   * Restrict to the demo pool — trials that passed validation and
   * back-translation (contract rule 5).
   *
   * Off by default, and deliberately. A trial flagged for a near-verbatim
   * `sourceSpan` has a citation-fidelity problem, not a wrong criterion tree, so
   * dropping it would shrink the sample without making the coverage number more
   * accurate. Report both and let the slide choose.
   */
  demoPoolOnly?: boolean;
  /** Label for the headline sentence, e.g. "lung cancer". */
  condition?: string;
}

/**
 * Size the chart requirement across a trial pool.
 *
 * Counts every leaf once. Nested groups are walked, so an OR of three biomarker
 * branches contributes three criteria — which is right for this question: each
 * branch is a separate thing somebody has to find out.
 */
export function claimsCoverage(
  trials: readonly Trial[],
  options: CoverageOptions = {},
): CoverageReport {
  const provenance = options.provenance ?? "claims";
  const condition = options.condition ?? "lung cancer";

  const pool = options.demoPoolOnly ? trials.filter((t) => !t.needsHumanReview) : trials;

  const overall = emptyCounts();
  const byPredicate = new Map<Predicate, ReturnType<typeof emptyCounts>>();
  const byType = {
    inclusion: emptyCounts(),
    exclusion: emptyCounts(),
  };
  const perTrial: TrialCoverage[] = [];
  const trialsWithoutCriteria: string[] = [];
  const trialsWithDuplicateCriterionIds: CoverageReport["trialsWithDuplicateCriterionIds"] = [];

  for (const trial of pool) {
    // Occurrences, not unique ids: a trial with colliding criterion ids would
    // otherwise be undercounted and the app's leaf-count assertion would fail.
    const leaves: CriterionLeaf[] = allLeaves(trial);
    if (leaves.length === 0) {
      trialsWithoutCriteria.push(trial.nctId);
      continue;
    }

    const dupes = duplicateLeafIds(trial);
    if (Object.keys(dupes).length > 0) {
      trialsWithDuplicateCriterionIds.push({ nctId: trial.nctId, ids: dupes });
    }

    const here = emptyCounts();
    for (const leaf of leaves) {
      const verdict: Answerability = answerableBy(leaf, provenance);
      here[verdict]++;
      overall[verdict]++;
      byType[leaf.type][verdict]++;

      const forPredicate = byPredicate.get(leaf.predicate) ?? emptyCounts();
      forPredicate[verdict]++;
      byPredicate.set(leaf.predicate, forPredicate);
    }

    perTrial.push({
      nctId: trial.nctId,
      title: trial.title,
      phase: trial.phase,
      needsHumanReview: trial.needsHumanReview,
      ...tallyOf(here),
    });
  }

  const overallTally = tallyOf(overall);

  // Bands in a fixed order, including the empty ones — a gap in the histogram is
  // information, and a missing key would hide it.
  const bands = Array.from({ length: 10 }, (_, i) => `${i * 10}-${i * 10 + 10}%`);
  const counted = new Map(bands.map((b) => [b, 0]));
  for (const t of perTrial) {
    const band = bandOf(t.shareAnswerable);
    counted.set(band, (counted.get(band) ?? 0) + 1);
  }

  return {
    headline:
      `Across ${perTrial.length} ${condition} trials, claims can answer ` +
      `${pct(overallTally.shareAnswerable)}% of eligibility criteria; ` +
      `the rest requires a chart.`,
    headlineBasis:
      `${overallTally.criteria} compiled criteria across ${perTrial.length} trials. ` +
      `The quoted share counts only criteria a claim records directly ` +
      `(${overallTally.yes}); the ${overallTally.sometimes} criteria that are ` +
      `sometimes visible in claims are counted as requiring a chart, so the ` +
      `figure is a lower bound. The upper bound is ` +
      `${pct(overallTally.shareAnswerableOptimistic)}%.`,
    provenance,
    trials: perTrial.length,
    overall: overallTally,
    byPredicate: PREDICATE_ORDER.filter((p) => byPredicate.has(p)).map((predicate) => ({
      predicate,
      tally: tallyOf(byPredicate.get(predicate)!),
    })),
    byType: (["inclusion", "exclusion"] as const).map((type) => ({
      type,
      tally: tallyOf(byType[type]),
    })),
    perTrial: perTrial.sort((a, b) =>
      a.shareAnswerable - b.shareAnswerable || (a.nctId < b.nctId ? -1 : 1),
    ),
    distribution: bands.map((band) => ({ band, trials: counted.get(band) ?? 0 })),
    trialsWithoutCriteria,
    trialsWithDuplicateCriterionIds,
  };
}
