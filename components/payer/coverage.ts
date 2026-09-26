/**
 * Claims can confirm age / prior_therapy / diagnosis / comorbidity without a
 * chart. Washout and contraindication are confirmable in the engine but coded
 * too loosely — they are the 875 "ambiguous" leaves. Counting them as
 * chart-needed is the conservative headline; counting them as claims-answerable
 * is the upper bound.
 *
 * The figure itself is not computed here. Read data/compiled/coverage.json
 * after the engine republishes it, and refuse any other leaf count.
 */
export const SLIDE_CRITERIA = 5105;

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

const CERTAIN = new Set(["age", "prior_therapy", "diagnosis", "comorbidity"]);
const AMBIGUOUS = new Set(["washout", "contraindication"]);

export function kindOf(predicate: string): PredicateKind {
  if (CERTAIN.has(predicate)) return "certain";
  if (AMBIGUOUS.has(predicate)) return "ambiguous";
  return "never";
}

export function isCompileStats(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.compiledTrials === "number" && rec.lowerRate === undefined && !Array.isArray(rec.byPredicate);
}

export function isClaimsCoverage(value: unknown): value is ClaimsCoverage {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.lowerRate === "number" && Array.isArray(rec.byPredicate) && typeof rec.criteria === "number";
}

/** Slides say 5,103. Any other leaf count is a different number — do not display it. */
export function assertSlideCoverage(coverage: Pick<ClaimsCoverage, "criteria">, path: string): void {
  if (coverage.criteria !== SLIDE_CRITERIA) {
    throw new Error(
      `${path} has ${coverage.criteria.toLocaleString("en-US")} criteria; slides say ${SLIDE_CRITERIA.toLocaleString("en-US")}. Refusing to show a different number.`,
    );
  }
}

/**
 * Accept the published claims figure, wait on compile-stats, throw on anything else.
 * Never walks trees.
 */

/**
 * The engine publishes coverage nested under `allCompiledTrials` / `demoPool`
 * with a tally shape. Map that onto the flat figure the screens read. This is
 * a translation, never a recomputation — every number comes from the engine.
 */
function fromEngineEnvelope(raw: Record<string, unknown>, path: string): ClaimsCoverage | null {
  const scope = (raw.allCompiledTrials ?? raw.demoPool) as Record<string, unknown> | undefined;
  if (!scope || typeof scope !== "object") return null;
  const overall = scope.overall as Record<string, number> | undefined;
  if (!overall || typeof overall.criteria !== "number") return null;

  const side = (type: string): SideCoverage => {
    const rows = (scope.byType as Array<{ type: string; tally: Record<string, number> }>) ?? [];
    const t = rows.find((r) => r.type === type)?.tally;
    return {
      count: t?.criteria ?? 0,
      answerable: t?.yes ?? 0,
      rate: t?.shareAnswerable ?? 0,
    };
  };

  const byPredicate: PredicateCoverage[] = (
    (scope.byPredicate as Array<{ predicate: string; tally: Record<string, number> }>) ?? []
  ).map((r) => ({
    predicate: r.predicate,
    count: r.tally.criteria,
    answerable: r.tally.yes,
    rate: r.tally.shareAnswerable,
    kind: kindOf(r.predicate),
  }));

  return {
    trials: (scope.trials as number) ?? 0,
    criteria: overall.criteria,
    answerable: overall.yes,
    ambiguous: overall.sometimes,
    lowerRate: overall.shareAnswerable,
    upperRate: overall.shareAnswerableOptimistic,
    inclusions: side("inclusion"),
    exclusions: side("exclusion"),
    byPredicate,
    source: path,
  };
}

export function readClaimsCoverage(raw: unknown, path: string): ClaimsCoverage | null {
  if (raw == null) return null;
  if (isCompileStats(raw)) return null;
  if (!isClaimsCoverage(raw)) {
    const mapped = fromEngineEnvelope(raw as Record<string, unknown>, path);
    if (mapped) {
      assertSlideCoverage(mapped, path);
      return mapped;
    }
    throw new Error(
      `${path} is not claims coverage (need criteria, lowerRate, byPredicate). Refusing to compute a figure from the trees.`,
    );
  }
  const coverage: ClaimsCoverage = {
    ...raw,
    source: typeof raw.source === "string" && raw.source.length > 0 ? raw.source : path,
  };
  assertSlideCoverage(coverage, path);
  return coverage;
}

export function pct1(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
