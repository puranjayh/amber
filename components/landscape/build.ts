import type { CriterionLeaf, CriterionNode, Trial } from "@/src/contracts";
import type { CriteriaLandscape } from "@/app/_data/schema";

function leaves(nodes: CriterionNode[]): CriterionLeaf[] {
  const out: CriterionLeaf[] = [];
  const visit = (node: CriterionNode) => {
    if (node.kind === "leaf") out.push(node);
    else node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

/**
 * Same distribution the compiler writes to data/compiled/landscape.json
 * (src/compiler/validate.ts buildCriteriaLandscape). Counts are de-duplicated
 * by trial so a repeated leaf cannot inflate the slide.
 */
export function buildLandscape(trials: Trial[]): CriteriaLandscape {
  const analytes = new Map<
    string,
    {
      trials: Set<string>;
      flaggedTrials: Set<string>;
      operators: Map<
        CriterionLeaf["operator"],
        { trials: Set<string>; flaggedTrials: Set<string>; thresholds: Map<number, Set<string>> }
      >;
    }
  >();

  for (const trial of trials) {
    for (const leaf of leaves(trial.criteria)) {
      if (typeof leaf.value !== "number") continue;
      const analyte = leaf.analyte || leaf.predicate;
      const entry = analytes.get(analyte) ?? { trials: new Set(), flaggedTrials: new Set(), operators: new Map() };
      entry.trials.add(trial.nctId);
      if (trial.needsHumanReview) entry.flaggedTrials.add(trial.nctId);

      const operator = entry.operators.get(leaf.operator) ?? {
        trials: new Set(),
        flaggedTrials: new Set(),
        thresholds: new Map(),
      };
      operator.trials.add(trial.nctId);
      if (trial.needsHumanReview) operator.flaggedTrials.add(trial.nctId);
      const at = operator.thresholds.get(leaf.value) ?? new Set<string>();
      at.add(trial.nctId);
      operator.thresholds.set(leaf.value, at);
      entry.operators.set(leaf.operator, operator);
      analytes.set(analyte, entry);
    }
  }

  return {
    generatedFromTrials: trials.length,
    analytes: [...analytes.entries()]
      .map(([analyte, entry]) => ({
        analyte,
        totalTrials: entry.trials.size,
        flaggedTrials: entry.flaggedTrials.size,
        operators: [...entry.operators.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([operator, values]) => ({
            operator,
            totalTrials: values.trials.size,
            flaggedTrials: values.flaggedTrials.size,
            thresholds: [...values.thresholds.entries()]
              .sort(([a], [b]) => a - b)
              .map(([threshold, ids]) => ({
                threshold,
                count: ids.size,
                percentage: entry.trials.size ? ids.size / entry.trials.size : 0,
              })),
          })),
      }))
      .sort((a, b) => b.totalTrials - a.totalTrials || a.analyte.localeCompare(b.analyte)),
  };
}

export function dominantThreshold(thresholds: { threshold: number; count: number; percentage: number }[]) {
  return [...thresholds].sort((a, b) => b.count - a.count || a.threshold - b.threshold)[0];
}

export function primaryOperator<T extends { totalTrials: number }>(operators: T[]): T | undefined {
  return [...operators].sort((a, b) => b.totalTrials - a.totalTrials)[0];
}

/** Consensus only when the leading threshold covers ≥ 80%. Tiny tails do not veto it. */
export function hasConsensus(thresholds: { percentage: number }[]): boolean {
  const top = [...thresholds].sort((a, b) => b.percentage - a.percentage)[0];
  return !!top && top.percentage >= 0.8;
}

/** "68% use 1500, 22% use 1000 · no consensus" */
export function thresholdHeadline(
  thresholds: { threshold: number; count: number; percentage: number }[],
): string {
  if (thresholds.length === 0) return "no numeric thresholds";
  const parts = [...thresholds]
    .sort((a, b) => b.percentage - a.percentage || a.threshold - b.threshold)
    .slice(0, 3)
    .map((t) => `${Math.round(t.percentage * 100)}% use ${t.threshold}`);
  return `${parts.join(", ")} · ${hasConsensus(thresholds) ? "consensus" : "no consensus"}`;
}
