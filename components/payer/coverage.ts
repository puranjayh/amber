import type { CriterionLeaf, CriterionNode, Trial } from "@/src/contracts";

/**
 * Claims can confirm these without a chart. Washout and contraindication are
 * confirmable in the engine but coded too loosely to count as a sure hit — they
 * are the 875 "ambiguous" leaves. Counting them as chart-needed is the
 * conservative headline; counting them as claims-answerable is the upper bound.
 */
const CERTAIN = new Set(["age", "prior_therapy", "diagnosis", "comorbidity"]);
const AMBIGUOUS = new Set(["washout", "contraindication"]);
const NEVER = new Set(["lab_value", "biomarker", "performance_status", "staging"]);

export type PredicateKind = "certain" | "ambiguous" | "never";

export type PredicateCoverage = {
  predicate: string;
  count: number;
  answerable: number;
  rate: number;
  kind: PredicateKind;
};

export type SideCoverage = { count: number; answerable: number; rate: number };

export type ClaimsCoverage = {
  trials: number;
  criteria: number;
  answerable: number;
  ambiguous: number;
  lowerRate: number;
  upperRate: number;
  inclusions: SideCoverage;
  exclusions: SideCoverage;
  byPredicate: PredicateCoverage[];
  source: string;
};

export function kindOf(predicate: string): PredicateKind {
  if (CERTAIN.has(predicate)) return "certain";
  if (AMBIGUOUS.has(predicate)) return "ambiguous";
  return "never";
}

function leavesOf(nodes: CriterionNode[]): CriterionLeaf[] {
  const out: CriterionLeaf[] = [];
  const walk = (node: CriterionNode) => {
    if (node.kind === "leaf") out.push(node);
    else node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function rate(n: number, d: number) {
  return d === 0 ? 0 : n / d;
}

export function buildClaimsCoverage(trials: Trial[], source: string): ClaimsCoverage {
  const compiled = trials.filter((t) => t.criteria.length > 0);
  const byPred = new Map<string, { count: number; answerable: number; kind: PredicateKind }>();
  const sides: Record<"inclusion" | "exclusion", { count: number; answerable: number }> = {
    inclusion: { count: 0, answerable: 0 },
    exclusion: { count: 0, answerable: 0 },
  };
  let answerable = 0;
  let ambiguous = 0;
  let criteria = 0;

  for (const trial of compiled) {
    for (const leaf of leavesOf(trial.criteria)) {
      criteria += 1;
      const kind = NEVER.has(leaf.predicate) ? "never" : kindOf(leaf.predicate);
      const row = byPred.get(leaf.predicate) ?? { count: 0, answerable: 0, kind };
      row.count += 1;
      const side = sides[leaf.type];
      side.count += 1;
      if (kind === "certain") {
        answerable += 1;
        row.answerable += 1;
        side.answerable += 1;
      } else if (kind === "ambiguous") {
        ambiguous += 1;
      }
      byPred.set(leaf.predicate, row);
    }
  }

  const byPredicate = [...byPred.entries()]
    .map(([predicate, row]) => ({
      predicate,
      count: row.count,
      answerable: row.answerable,
      rate: rate(row.answerable, row.count),
      kind: row.kind,
    }))
    .sort((a, b) => b.rate - a.rate || b.count - a.count || a.predicate.localeCompare(b.predicate));

  return {
    trials: compiled.length,
    criteria,
    answerable,
    ambiguous,
    lowerRate: rate(answerable, criteria),
    upperRate: rate(answerable + ambiguous, criteria),
    inclusions: {
      count: sides.inclusion.count,
      answerable: sides.inclusion.answerable,
      rate: rate(sides.inclusion.answerable, sides.inclusion.count),
    },
    exclusions: {
      count: sides.exclusion.count,
      answerable: sides.exclusion.answerable,
      rate: rate(sides.exclusion.answerable, sides.exclusion.count),
    },
    byPredicate,
    source,
  };
}

export function isClaimsCoverage(value: unknown): value is ClaimsCoverage {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.lowerRate === "number" && Array.isArray(rec.byPredicate) && typeof rec.criteria === "number";
}

export function pct1(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
