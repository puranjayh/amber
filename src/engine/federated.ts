/**
 * Federated aggregation — the layer that lets three hospitals compare protocols
 * without any of them shipping a patient record anywhere.
 *
 * Each site runs the engine on its own cohort. What crosses the wire is this
 * report: counts and elasticity curves, and nothing else. There is no patient
 * id, no date of birth, no fact, no citation of a chart note anywhere in the
 * output type, and a test asserts that by searching the serialised report for
 * every patient id in the input.
 *
 * SMALL-CELL SUPPRESSION. A count between 1 and 10 is reported as `<11`, never
 * as a number. That much is easy and it is also not enough on its own, because
 * counts in a report add up:
 *
 *   screened 200, eligible <11, eliminated 195   →   eligible is 5. Subtraction.
 *   pooled eligible 50, site A <11, site B 40    →   site A is 10. Subtraction.
 *
 * So suppression here is complementary, which is the standard disclosure-control
 * answer: whenever hiding one cell would leave it recoverable from its siblings
 * and their total, a second cell is hidden too. `eligible` and `eliminated` are
 * suppressed as a pair, because either one plus `screened` gives the other. A
 * per-site figure that is the only suppressed cell in its column drags the next
 * smallest site down with it, so the pooled total survives; when a column has
 * too few cells for that to work, the pooled total is suppressed instead. The
 * rules interact, so they are applied to a fixpoint rather than in one pass.
 *
 * WHAT THIS DOES NOT DO, stated plainly because a medical demo should not
 * overclaim:
 *
 *   - It is cell suppression, not differential privacy. There is no noise and no
 *     privacy budget, so it cannot bound what repeated releases leak.
 *   - An adversary who can request reports for two cohorts differing by one
 *     patient can learn about that patient by differencing them. Nothing here
 *     prevents that; the release process has to.
 *   - A fine-grained elasticity curve leaks by the same route. If eligibility
 *     falls from 40 to 39 across one step of the threshold, one patient sits at
 *     that value. Suppression is per point and does not hide the step, so curves
 *     for release should use coarse `sweepStep` values.
 *
 * Pure: no clock, no I/O. `asOf` is passed in and echoed back so a report is
 * self-describing.
 */
import type { Patient, Trial } from "@/src/contracts";
import { evaluate, indexLeaves } from "./evaluate";
import { sweep, sweepableLeaves } from "./elasticity";

/** `"<11"`. The threshold is part of the marker so a reader cannot mistake it. */
export type SuppressionMarker = `<${number}`;

/** A count that is either safe to publish or has been withheld. */
export type SuppressedCount = number | SuppressionMarker;

export interface SiteCohort {
  siteId: string;
  patients: readonly Patient[];
}

export interface FederatedCounts {
  screened: SuppressedCount;
  eligible: SuppressedCount;
  eliminated: SuppressedCount;
}

export interface FederatedTrialReport {
  nctId: string;
  bySite: { siteId: string; counts: FederatedCounts }[];
  pooled: FederatedCounts;
}

export interface FederatedElasticityPoint {
  threshold: number;
  eligibleCount: SuppressedCount;
  excludedByThisAlone: SuppressedCount;
  bySubgroup: Record<string, SuppressedCount>;
}

export interface FederatedElasticityCurve {
  siteId: string;
  nctId: string;
  criterionId: string;
  /** The trial's own words. A curve is a claim about a protocol. */
  label: string;
  points: FederatedElasticityPoint[];
}

export interface FederatedReport {
  asOf: string;
  minCellSize: number;
  siteIds: string[];
  trials: FederatedTrialReport[];
  curves: FederatedElasticityCurve[];
  /** Plain-language statement of what this release protects, and what it does not. */
  disclosureNotice: string;
}

export interface FederateOptions {
  /** Counts below this are withheld. 11 by default. */
  minCellSize?: number;
  /**
   * Restrict the curves, by `nctId`, to these criterion ids. Omit for every
   * leaf the compiler marked sweepable.
   */
  criterionIds?: Readonly<Record<string, readonly string[]>>;
}

export const DEFAULT_MIN_CELL_SIZE = 11;

const marker = (min: number): SuppressionMarker => `<${min}`;

/** Is this cell withheld? Narrows the union for callers rendering a table. */
export function isSuppressed(count: SuppressedCount): count is SuppressionMarker {
  return typeof count === "string";
}

/** Primary suppression, applied to a single cell. Zero reveals nobody. */
export function suppress(value: number, min: number = DEFAULT_MIN_CELL_SIZE): SuppressedCount {
  if (value === 0) return 0;
  return value < min ? marker(min) : value;
}

/**
 * Which cells of a breakdown must be withheld, given that the parts sum to the
 * total and both are being published together.
 *
 * Returns the indices to hide, and whether the total has to go too. The rule:
 * hide anything under the threshold; then, if anything is hidden, make sure at
 * least two non-zero parts are hidden, taking the smallest published ones first,
 * so no hidden cell can be recovered by subtracting the rest from the total. If
 * there are not two non-zero parts to work with, the total is withheld instead.
 */
export function complementarySuppression(
  parts: readonly number[],
  min: number = DEFAULT_MIN_CELL_SIZE,
): { hide: Set<number>; hideTotal: boolean } {
  const hide = new Set<number>();
  parts.forEach((v, i) => {
    if (v > 0 && v < min) hide.add(i);
  });
  if (hide.size === 0) return { hide, hideTotal: false };

  const nonZero = parts.map((v, i) => ({ v, i })).filter(({ v }) => v > 0);
  if (nonZero.length < 2) return { hide, hideTotal: true };

  // Drag in the next smallest published cells until two are hidden.
  const candidates = nonZero.filter(({ i }) => !hide.has(i)).sort((a, b) => a.v - b.v || a.i - b.i);
  for (const { i } of candidates) {
    if (hide.size >= 2) break;
    hide.add(i);
  }
  return { hide, hideTotal: hide.size < 2 };
}

/* ------------------------------------------------------------- raw tallying */

interface RawCounts {
  screened: number;
  eligible: number;
  eliminated: number;
}

type Field = keyof RawCounts;
const FIELDS: Field[] = ["screened", "eligible", "eliminated"];

function tally(trial: Trial, patients: readonly Patient[], asOf: string): RawCounts {
  let eligible = 0;
  for (const p of patients) {
    if (!evaluate(p, trial, asOf).eliminated) eligible++;
  }
  return { screened: patients.length, eligible, eliminated: patients.length - eligible };
}

/**
 * Apply every suppression rule to one trial's site rows plus the pooled row.
 *
 * The rules feed each other — hiding a site's `eligible` for a column reason
 * forces its `eliminated` to go too, which can then make `eliminated`'s own
 * column need a second cell — so this runs to a fixpoint. The rule set only ever
 * adds suppressions, so it terminates.
 */
function suppressTrial(
  raw: readonly RawCounts[],
  pooled: RawCounts,
  min: number,
): { bySite: FederatedCounts[]; pooled: FederatedCounts } {
  /** hidden[field] = set of site indices; hiddenPooled[field] = the pooled cell. */
  const hidden: Record<Field, Set<number>> = {
    screened: new Set(),
    eligible: new Set(),
    eliminated: new Set(),
  };
  const hiddenPooled = new Set<Field>();

  for (let pass = 0; pass < 8; pass++) {
    const before =
      FIELDS.reduce((n, f) => n + hidden[f].size, 0) + hiddenPooled.size;

    for (const field of FIELDS) {
      // Column rule: a suppressed site cell must not be recoverable from the
      // other sites and the pooled total.
      const column = raw.map((r) => r[field]);
      const { hide, hideTotal } = complementarySuppression(column, min);
      for (const i of hide) hidden[field].add(i);
      if (hidden[field].size > 0 && (hideTotal || hidden[field].size < 2)) {
        hiddenPooled.add(field);
      }
      if (suppress(pooled[field], min) !== pooled[field]) hiddenPooled.add(field);
    }

    // Row rule: eligible + eliminated = screened, so the two parts go together.
    for (let i = 0; i < raw.length; i++) {
      if (hidden.eligible.has(i) || hidden.eliminated.has(i)) {
        hidden.eligible.add(i);
        hidden.eliminated.add(i);
      }
    }
    if (hiddenPooled.has("eligible") || hiddenPooled.has("eliminated")) {
      hiddenPooled.add("eligible");
      hiddenPooled.add("eliminated");
    }

    const after = FIELDS.reduce((n, f) => n + hidden[f].size, 0) + hiddenPooled.size;
    if (after === before) break;
  }

  const render = (value: number, isHidden: boolean): SuppressedCount =>
    isHidden ? marker(min) : suppress(value, min);

  return {
    bySite: raw.map((r, i) => ({
      screened: render(r.screened, hidden.screened.has(i)),
      eligible: render(r.eligible, hidden.eligible.has(i)),
      eliminated: render(r.eliminated, hidden.eliminated.has(i)),
    })),
    pooled: {
      screened: render(pooled.screened, hiddenPooled.has("screened")),
      eligible: render(pooled.eligible, hiddenPooled.has("eligible")),
      eliminated: render(pooled.eliminated, hiddenPooled.has("eliminated")),
    },
  };
}

/* ------------------------------------------------------------------- report */

const NOTICE =
  "Aggregate counts only; no record-level data. Counts below the minimum cell " +
  "size are withheld as \"<n\", with complementary suppression so a withheld " +
  "cell cannot be recovered by subtraction. This is cell suppression, not " +
  "differential privacy: it does not bound what repeated or differenced " +
  "releases disclose, and fine-grained elasticity curves can localise an " +
  "individual — use coarse sweep steps for release.";

/**
 * One report covering every site, every trial, and the requested curves.
 *
 * Curves are per site, never pooled: the exhibit is that the same threshold
 * costs different sites different amounts, and pooling erases exactly that.
 */
export function federate(
  sites: readonly SiteCohort[],
  trials: readonly Trial[],
  asOf: string,
  options: FederateOptions = {},
): FederatedReport {
  const min = options.minCellSize ?? DEFAULT_MIN_CELL_SIZE;

  const trialReports: FederatedTrialReport[] = trials.map((trial) => {
    const raw = sites.map((s) => tally(trial, s.patients, asOf));
    const pooled = raw.reduce(
      (acc, r) => ({
        screened: acc.screened + r.screened,
        eligible: acc.eligible + r.eligible,
        eliminated: acc.eliminated + r.eliminated,
      }),
      { screened: 0, eligible: 0, eliminated: 0 },
    );
    const { bySite, pooled: pooledOut } = suppressTrial(raw, pooled, min);
    return {
      nctId: trial.nctId,
      bySite: sites.map((s, i) => ({ siteId: s.siteId, counts: bySite[i] })),
      pooled: pooledOut,
    };
  });

  const curves: FederatedElasticityCurve[] = [];
  for (const trial of trials) {
    const leaves = indexLeaves(trial);
    const wanted = options.criterionIds?.[trial.nctId];
    const targets =
      wanted === undefined
        ? sweepableLeaves(trial)
        : wanted.map((id) => {
            const leaf = leaves.get(id);
            if (leaf === undefined) {
              throw new Error(`federated: trial ${trial.nctId} has no criterion ${id}.`);
            }
            return leaf;
          });

    for (const leaf of targets) {
      for (const site of sites) {
        const points = sweep(trial, leaf.id, site.patients, asOf).map((p) => {
          const groups = Object.keys(p.bySubgroup ?? {}).sort();
          const values = groups.map((g) => p.bySubgroup![g]);
          // The subgroup breakdown sums to the eligible count, so it is a
          // breakdown like any other and gets the same treatment.
          const { hide, hideTotal } = complementarySuppression(values, min);
          const bySubgroup: Record<string, SuppressedCount> = {};
          groups.forEach((g, i) => {
            bySubgroup[g] = hide.has(i) ? marker(min) : suppress(values[i], min);
          });
          return {
            threshold: p.threshold,
            eligibleCount: hideTotal ? marker(min) : suppress(p.eligibleCount, min),
            excludedByThisAlone: suppress(p.excludedByThisAlone, min),
            bySubgroup,
          };
        });
        curves.push({
          siteId: site.siteId,
          nctId: trial.nctId,
          criterionId: leaf.id,
          label: leaf.sourceSpan,
          points,
        });
      }
    }
  }

  return {
    asOf,
    minCellSize: min,
    siteIds: sites.map((s) => s.siteId),
    trials: trialReports,
    curves,
    disclosureNotice: NOTICE,
  };
}
