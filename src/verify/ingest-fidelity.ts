/**
 * Read human fidelity verdicts back and report what they say.
 *
 * The headline sentence this produces is the one we want to be able to say:
 *
 *   "We hand-reviewed 77 compiled criteria against source protocol text;
 *    compilation was faithful in N, and our detector caught X of the Y errors."
 *
 * THE STATISTICAL TRAP, AND HOW THIS AVOIDS IT. The sample is stratified and the
 * two strata are drawn differently on purpose: all 37 flagged trials contribute a
 * criterion chosen because it looked suspicious, while the unflagged stratum is 40
 * criteria drawn uniformly from roughly two thousand. So "the detector caught X of
 * Y errors in the sample" is a true statement about the sample and a badly
 * misleading one about the corpus — flagged criteria are massively oversampled, so
 * the detector's apparent recall is inflated.
 *
 * Both numbers are therefore reported and labelled:
 *
 *   - `sample` — exactly what was reviewed, no extrapolation. Defensible without
 *     caveat, and the source of the headline sentence.
 *   - `corpusEstimate` — the same quantities reweighted by each stratum's sampling
 *     rate, with a Wilson interval on the base error rate. This is the number that
 *     describes the compiler, and it is an estimate, and it says so.
 *
 * `null` verdicts are counted separately and excluded from both denominators. A
 * reviewer who could not tell is data, not a faithful row, and rounding those into
 * "faithful" would flatter the compiler.
 *
 * Pure: verdicts in, report out. The caller does the file I/O.
 */
import type { FidelityRow, FidelitySheet } from "./fidelity";

export interface StratumResult {
  stratum: "flagged" | "unflagged";
  reviewed: number;
  /** Rows the reviewer marked either way. The denominator for `errorRate`. */
  judged: number;
  faithful: number;
  unfaithful: number;
  undecided: number;
  errorRate: number;
  failureModes: { mode: string; count: number }[];
}

export interface WilsonInterval {
  low: number;
  high: number;
}

export interface FidelityReport {
  /** The sentence to put on the slide. Generated, so it cannot drift. */
  headline: string;
  /** What the headline does and does not claim. */
  headlineBasis: string;

  seed: number;
  corpus: FidelitySheet["corpus"];

  sample: {
    reviewed: number;
    judged: number;
    faithful: number;
    unfaithful: number;
    undecided: number;
    /** Unfaithful rows that sat in a flagged trial — what the detector caught. */
    detectorCaught: number;
    /** Unfaithful rows the detector said nothing about. */
    detectorMissed: number;
    /** detectorCaught / unfaithful, over the sample only. Oversampled: see above. */
    detectorRecallInSample: number;
    /** Of flagged rows judged, the share that were genuinely unfaithful. */
    detectorPrecision: number;
    byStratum: StratumResult[];
  };

  corpusEstimate: {
    /** Base error rate from the unflagged stratum — the unbiased one. */
    baseErrorRate: number;
    baseErrorRate95: WilsonInterval;
    /** Criteria in unflagged trials, from the sheet's own accounting. */
    unflaggedCriteria: number;
    estimatedUnfaithfulUnflagged: number;
    /** Errors found in flagged trials, unweighted — each trial contributed one row. */
    observedUnfaithfulFlagged: number;
    /** A weighted recall estimate, and the caveat that goes with it. */
    estimatedDetectorRecall: number;
    caveats: string[];
  };

  /** Rows the reviewer left blank, by id, so the sheet can be finished. */
  unreviewedRowIds: string[];
}

/**
 * Wilson score interval. Chosen over the normal approximation because the counts
 * here are small — 40 rows, possibly two errors — and the normal interval goes
 * negative in exactly that regime, which looks ridiculous on a slide.
 */
export function wilson95(successes: number, trials: number): WilsonInterval {
  if (trials === 0) return { low: 0, high: 0 };
  const z = 1.959964;
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return {
    low: Number(Math.max(0, (centre - spread) / denom).toFixed(4)),
    high: Number(Math.min(1, (centre + spread) / denom).toFixed(4)),
  };
}

const rate = (n: number, of: number): number => (of === 0 ? 0 : Number((n / of).toFixed(4)));

function summarise(stratum: StratumResult["stratum"], rows: readonly FidelityRow[]): StratumResult {
  const mine = rows.filter((r) => r.stratum === stratum);
  const faithful = mine.filter((r) => r.faithful === true).length;
  const unfaithful = mine.filter((r) => r.faithful === false).length;
  const undecided = mine.filter((r) => r.faithful === null).length;

  const modes = new Map<string, number>();
  for (const row of mine) {
    if (row.faithful !== false) continue;
    const mode = (row.failureMode ?? "unspecified").trim().toLowerCase() || "unspecified";
    modes.set(mode, (modes.get(mode) ?? 0) + 1);
  }

  return {
    stratum,
    reviewed: mine.length,
    judged: faithful + unfaithful,
    faithful,
    unfaithful,
    undecided,
    errorRate: rate(unfaithful, faithful + unfaithful),
    failureModes: [...modes.entries()]
      .map(([mode, count]) => ({ mode, count }))
      .sort((a, b) => b.count - a.count || (a.mode < b.mode ? -1 : 1)),
  };
}

/** Read a completed (or partly completed) sheet and report what it says. */
export function ingestFidelity(sheet: FidelitySheet): FidelityReport {
  const rows = sheet.rows;
  const flagged = summarise("flagged", rows);
  const unflagged = summarise("unflagged", rows);

  const judged = flagged.judged + unflagged.judged;
  const faithful = flagged.faithful + unflagged.faithful;
  const unfaithful = flagged.unfaithful + unflagged.unfaithful;
  const undecided = flagged.undecided + unflagged.undecided;

  const detectorCaught = flagged.unfaithful;
  const detectorMissed = unflagged.unfaithful;

  // Reweighting. The unflagged stratum is a uniform sample of its population, so
  // its error rate scales; the flagged stratum is a census of trials with one
  // targeted criterion each, so it does not.
  const unflaggedCriteria = sheet.strata.unflagged.criteriaAvailable;
  const baseErrorRate = unflagged.errorRate;
  const estimatedUnfaithfulUnflagged = Math.round(baseErrorRate * unflaggedCriteria);
  const estimatedTotal = estimatedUnfaithfulUnflagged + flagged.unfaithful;

  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

  return {
    headline:
      `We hand-reviewed ${judged} compiled criteria against source protocol text; ` +
      `compilation was faithful in ${faithful}, and our detector caught ` +
      `${detectorCaught} of the ${unfaithful} errors.`,
    headlineBasis:
      `${rows.length} rows sampled, ${judged} judged, ${undecided} left undecided and ` +
      `excluded from every rate. The two strata are drawn differently on purpose: all ` +
      `${sheet.strata.flagged.trials} flagged trials contributed one criterion each, ` +
      `chosen because it looked suspicious, while the unflagged stratum is ` +
      `${sheet.strata.unflagged.sampled} criteria drawn uniformly from ` +
      `${unflaggedCriteria}. So "caught ${detectorCaught} of ${unfaithful}" is a true ` +
      `statement about this sample and an overstatement about the corpus, because ` +
      `flagged criteria are oversampled by roughly ` +
      `${unflaggedCriteria === 0 ? "n/a" : Math.round(1 / Math.max(sheet.strata.unflagged.samplingRate, 1e-9))}x. ` +
      `The reweighted estimate is in \`corpusEstimate\`.`,
    seed: sheet.seed,
    corpus: sheet.corpus,
    sample: {
      reviewed: rows.length,
      judged,
      faithful,
      unfaithful,
      undecided,
      detectorCaught,
      detectorMissed,
      detectorRecallInSample: rate(detectorCaught, unfaithful),
      detectorPrecision: rate(flagged.unfaithful, flagged.judged),
      byStratum: [flagged, unflagged],
    },
    corpusEstimate: {
      baseErrorRate,
      baseErrorRate95: wilson95(unflagged.unfaithful, unflagged.judged),
      unflaggedCriteria,
      estimatedUnfaithfulUnflagged,
      observedUnfaithfulFlagged: flagged.unfaithful,
      estimatedDetectorRecall: rate(flagged.unfaithful, estimatedTotal),
      caveats: [
        `The base error rate ${pct(baseErrorRate)} rests on ${unflagged.judged} judged ` +
          `rows, so its 95% interval is wide. Quote the interval, not the point.`,
        "The flagged stratum's criterion was chosen for suspicion, not at random, so " +
          "its error rate is an upper bound on those trials' average and cannot be " +
          "read as an estimate of it.",
        "One criterion was reviewed per flagged trial. If a flagged trial's real " +
          "error sits in a criterion we did not surface, it counts as a miss here, " +
          "which makes the detector look worse than it is rather than better.",
        "Every figure describes the compiler at one corpus sha. Recompile and it " +
          "must be re-measured.",
      ],
    },
    unreviewedRowIds: rows.filter((r) => r.faithful === null).map((r) => r.id),
  };
}
