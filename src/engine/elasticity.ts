/**
 * Elasticity: how many patients a single threshold costs.
 *
 * Slide the ANC floor from 1000 to 2000 and watch the eligible count move. The
 * point of the exhibit is that some criteria are nearly free and some cost a
 * third of the cohort, and a protocol author cannot tell which from the prose.
 *
 * Two counts per threshold, and the second is the interesting one:
 *
 *   eligibleCount         — patients not excluded at this threshold
 *   excludedByThisAlone   — patients this criterion, and only this criterion,
 *                           is keeping out. Relax it and they are candidates.
 *                           Someone already excluded on stage as well is not
 *                           counted; loosening this threshold would not help
 *                           them, and counting them would oversell the fix.
 *
 * `eligibleCount` counts patients not *excluded*, which is not the same as
 * proven eligible — a patient with open unknowns is still in the count, because
 * absence of evidence is not evidence of absence (rule 4). "Not excluded" is
 * the honest curve; a "definitely eligible" curve would sit near zero and would
 * be measuring our record-keeping, not the protocol.
 *
 * Pure: the trial is never mutated, it is rebuilt per threshold.
 */
import type {
  CriterionLeaf,
  CriterionNode,
  ElasticityPoint,
  Patient,
  Trial,
} from "@/src/contracts";
import { blockingCriterionIds, evaluate, indexLeaves } from "./evaluate";

/**
 * A sweep the UI can precompute and scrub through. Beyond this the range or the
 * step is wrong, and we say so rather than emitting thousands of points that
 * will be dragged across at 60fps.
 */
export const MAX_SWEEP_POINTS = 200;

/** How many decimals to keep, so 0.1 steps do not produce 0.30000000000000004. */
function decimalsOf(n: number): number {
  const s = String(n);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : Math.min(s.length - dot - 1, 10);
}

/** The thresholds to test, endpoints included. */
export function sweepThresholds(leaf: CriterionLeaf): number[] {
  if (leaf.sweepRange === undefined) {
    throw new Error(
      `elasticity: criterion ${leaf.id} has no sweepRange. ` +
        `Every numeric leaf must carry one (docs/CONTRACT.md §3).`,
    );
  }
  const [lo, hi] = leaf.sweepRange;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new Error(`elasticity: criterion ${leaf.id} has a non-finite sweepRange.`);
  }
  if (hi < lo) {
    throw new Error(`elasticity: criterion ${leaf.id} has an inverted sweepRange [${lo}, ${hi}].`);
  }

  // A range with no step gets ten intervals — enough to show the shape of the
  // curve without inventing a precision the compiler did not claim.
  const step = leaf.sweepStep ?? (hi > lo ? (hi - lo) / 10 : 1);
  if (!(step > 0)) {
    throw new Error(`elasticity: criterion ${leaf.id} has a non-positive sweepStep ${step}.`);
  }

  const count = Math.floor((hi - lo) / step) + 1;
  if (count > MAX_SWEEP_POINTS) {
    throw new Error(
      `elasticity: criterion ${leaf.id} would need ${count} points ` +
        `(range [${lo}, ${hi}] step ${step}); the cap is ${MAX_SWEEP_POINTS}. ` +
        `Widen the step or narrow the range.`,
    );
  }

  const decimals = Math.max(decimalsOf(lo), decimalsOf(step));
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Number((lo + i * step).toFixed(decimals)));
  }
  // Always test the far end, even when the step does not divide the range.
  const last = Number(hi.toFixed(decimals));
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * The same trial with one leaf's threshold replaced. Structural sharing where
 * nothing changed; the input trial is never touched.
 */
export function withLeafValue(
  trial: Trial,
  criterionId: string,
  value: number,
): Trial {
  let found = false;

  const rewrite = (node: CriterionNode): CriterionNode => {
    if (node.kind === "leaf") {
      if (node.id !== criterionId) return node;
      found = true;
      return { ...node, value };
    }
    return { ...node, children: node.children.map(rewrite) };
  };

  const criteria = trial.criteria.map(rewrite);
  if (!found) {
    throw new Error(`elasticity: trial ${trial.nctId} has no criterion ${criterionId}.`);
  }
  return { ...trial, criteria };
}

/** Which criteria of this trial the slider can actually offer. */
export function sweepableLeaves(trial: Trial): CriterionLeaf[] {
  return [...indexLeaves(trial).values()].filter(
    (l) => l.sweepable && l.sweepRange !== undefined,
  );
}

/**
 * Sweep one criterion's threshold across its declared range.
 *
 * `bySubgroup` is keyed on `patient.race` and always carries every group in the
 * cohort, including those that drop to zero — a subgroup that vanishes from the
 * curve is the finding, and a missing key would hide it.
 */
export function sweep(
  trial: Trial,
  criterionId: string,
  patients: readonly Patient[],
  asOf: string,
): ElasticityPoint[] {
  const leaf = indexLeaves(trial).get(criterionId);
  if (leaf === undefined) {
    throw new Error(`elasticity: trial ${trial.nctId} has no criterion ${criterionId}.`);
  }

  const subgroups = [...new Set(patients.map((p) => p.race))].sort();

  return sweepThresholds(leaf).map((threshold) => {
    const variant = withLeafValue(trial, criterionId, threshold);

    let eligibleCount = 0;
    let excludedByThisAlone = 0;
    const bySubgroup: Record<string, number> = Object.fromEntries(
      subgroups.map((g) => [g, 0]),
    );

    for (const patient of patients) {
      const result = evaluate(patient, variant, asOf);
      if (!result.eliminated) {
        eligibleCount++;
        bySubgroup[patient.race]++;
      } else if (blockingCriterionIds(variant, result).includes(criterionId)) {
        excludedByThisAlone++;
      }
    }

    return { threshold, eligibleCount, excludedByThisAlone, bySubgroup };
  });
}
