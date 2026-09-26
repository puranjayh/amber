/**
 * The scoring path. Deterministic comparisons and exact date math, no model
 * inference anywhere (docs/CONTRACT.md §4 rule 2), no clock, no I/O.
 *
 * ---------------------------------------------------------------------------
 * POLARITY — read this before touching a verdict.
 *
 * `CubeCell.verdict` answers "does this criterion's own condition hold for this
 * patient", which is the polarity the frozen contract is written in:
 *
 *     Trial verdict: any inclusion FAIL, or any exclusion PASS → ELIMINATED
 *
 * So for the exclusion "prior osimertinib", a patient who HAS had osimertinib
 * gets verdict PASS — the exclusion fired — and the trial is eliminated.
 *
 * That is the only polarity in which nested groups stay correct. An exclusion
 * group `OR(prior osimertinib, prior erlotinib)` means "excluded if either",
 * and the OR only composes that way if each leaf reports whether its own
 * condition holds. Flipping leaves to a patient-facing "did the patient clear
 * this" would silently turn that OR into an AND by De Morgan and let a patient
 * with one of the two drugs through. That is a wrong-patient-on-trial bug.
 *
 * The patient-facing reading — matching an exclusion means the patient FAILS
 * it — is what a UI should show and what the polarity suite asserts. Get it
 * from `eligibilityVerdict()`, which negates exclusions and, because it is
 * built on Kleene NOT, leaves UNKNOWN as UNKNOWN.
 *
 * Both readings agree on the thing that matters: a fact matching an exclusion
 * eliminates the patient from the trial, and is never favourable.
 * ---------------------------------------------------------------------------
 */
import {
  TIER_WEIGHT,
  type CriterionLeaf,
  type CriterionNode,
  type CubeCell,
  type Fact,
  type Operator,
  type PairResult,
  type Patient,
  type Predicate,
  type Reason,
  type Trial,
  type Verdict,
} from "@/src/contracts";
import { combine, not } from "./kleene";
import { ageInDays, daysBetween } from "./time";

/* ------------------------------------------------------------------ options */

export interface EvaluateOptions {
  /**
   * Stop at the first eliminating top-level criterion (the contract's
   * short-circuit). Off by default, because the criteria table, the elasticity
   * sweep and the equity audit all need the whole cube — and "what else is
   * missing" is the product. Turn it on for a hot path that only needs the
   * eliminated flag.
   */
  shortCircuit?: boolean;
}

/* --------------------------------------------------------- leaf-level detail */

type LeafType = "inclusion" | "exclusion";

interface LeafOutcome {
  verdict: Verdict;
  reason: Reason;
  /** The fact the verdict rests on. Absent only when nothing matched at all. */
  fact?: Fact;
  ageDays?: number;
}

/**
 * Predicates where several facts coexist and none supersedes the others: a
 * patient's therapy history is a set, not a latest reading. For these, and for
 * any list-membership operator, we quantify over every fresh matching fact
 * rather than taking the most recent one.
 *
 * Everything else — a lab value, an ECOG score, a stage — is a measurement
 * that a newer measurement replaces, so the most recent fresh fact wins. Taking
 * the best of several fresh labs instead would be quietly optimistic scoring.
 */
const SET_VALUED: ReadonlySet<Predicate> = new Set<Predicate>([
  "prior_therapy",
  "comorbidity",
  "contraindication",
]);

/** `not_in` and `!=` assert something about EVERY fact, not about one of them. */
const UNIVERSAL_OPERATORS: ReadonlySet<Operator> = new Set<Operator>(["not_in", "!="]);

const norm = (s: string): string => s.trim().toLowerCase();

/* ------------------------------------------------------------ fact selection */

/**
 * Does this fact speak to this leaf at all?
 *
 * `analyte` filters, `drugClass` does not, and the difference matters. An
 * analyte names WHICH QUESTION is being asked — an albumin result is not a
 * partial answer about ANC, it is an answer to a different question, so a
 * criterion about ANC stays UNKNOWN in its presence. A drug class names WHICH
 * ANSWERS COUNT AS YES to the question "what therapy has this patient had",
 * and that question is answered by the therapy history as a whole. A
 * documented history of pembrolizumab alone does answer "prior EGFR TKI?" — it
 * answers no. Filtering on drugClass here instead would leave every drug-class
 * exclusion permanently UNKNOWN for every patient treated with something else,
 * and nobody would ever clear an exclusion.
 */
function factMatchesLeaf(leaf: CriterionLeaf, fact: Fact): boolean {
  if (fact.predicate !== leaf.predicate) return false;

  if (leaf.analyte !== undefined) {
    if (fact.analyte === undefined) return false;
    if (norm(fact.analyte) !== norm(leaf.analyte)) return false;
  }

  return true;
}

/**
 * Age lives on the patient record, not in the narrative, so there is usually no
 * `age` fact to cite. Rather than call every age criterion UNKNOWN — which
 * would bury the real unknowns the product exists to surface — we cite the
 * structured demographics field and say so in the citation text. It is not
 * dressed up as a sentence from a chart note.
 */
function demographicAgeFact(patient: Patient, asOf: string): Fact {
  return {
    predicate: "age",
    value: patient.age,
    unit: "years",
    observedAt: asOf,
    sourceQuote: `age ${patient.age} (structured demographics, ${patient.id})`,
    sourceDoc: "patient record",
    provenance: "chart",
  };
}

/* ---------------------------------------------------------- the comparisons */

/** A unit mismatch is not converted, it is refused. Contract rule 5. */
function unitsComparable(leaf: CriterionLeaf, fact: Fact): boolean {
  if (leaf.unit === undefined || fact.unit === undefined) return true;
  return norm(leaf.unit) === norm(fact.unit);
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * The left-hand side of a numeric comparison.
 *
 * `washout` is the one predicate that needs deriving: a washout fact is usually
 * the date of the last dose, and the criterion is a number of days, so we
 * measure the gap to `asOf`. A fact that already carries a day count is used
 * as-is.
 */
function numericFactValue(
  leaf: CriterionLeaf,
  fact: Fact,
  asOf: string,
): number | null {
  if (leaf.predicate === "washout" && typeof fact.value === "string") {
    const elapsed = daysBetween(fact.value, asOf);
    return elapsed === null ? null : Math.max(0, elapsed);
  }
  return asNumber(fact.value);
}

/** Null means "these two things are not comparable", never "not equal". */
function looseEquals(factValue: Fact["value"], target: CriterionLeaf["value"]): boolean | null {
  if (Array.isArray(target)) return null; // == against a list is a compiler bug

  if (typeof factValue === "boolean" || typeof target === "boolean") {
    const toBool = (v: unknown): boolean | null => {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") {
        const n = norm(v);
        if (n === "true" || n === "yes" || n === "positive") return true;
        if (n === "false" || n === "no" || n === "negative") return false;
      }
      return null;
    };
    const a = toBool(factValue);
    const b = toBool(target);
    return a === null || b === null ? null : a === b;
  }

  if (typeof factValue === "number" || typeof target === "number") {
    const a = asNumber(factValue);
    const b = asNumber(target);
    if (a !== null && b !== null) return a === b;
    // A number against a non-numeric string is a category error, not a mismatch.
    return null;
  }

  return norm(String(factValue)) === norm(String(target));
}

/**
 * Does this one fact satisfy the leaf's operator?
 * true = satisfied, false = violated, null = not comparable (→ `unsupported`).
 */
function satisfies(leaf: CriterionLeaf, fact: Fact, asOf: string): boolean | null {
  switch (leaf.operator) {
    case "in":
    case "not_in": {
      const list = Array.isArray(leaf.value) ? leaf.value : leaf.members;
      if (list === undefined || list.length === 0) return null;
      const hay = list.map(norm);
      // Three ways the fact can land in the class: it names a member drug, it
      // names the class itself, or it declares the class the compiler resolved
      // via RxNorm. Records say "unnamed EGFR TKI" more often than you would
      // like, and that still answers the question.
      const hit =
        hay.includes(norm(String(fact.value))) ||
        (fact.drugClass !== undefined &&
          (hay.includes(norm(fact.drugClass)) ||
            (leaf.drugClass !== undefined && norm(fact.drugClass) === norm(leaf.drugClass))));
      return leaf.operator === "in" ? hit : !hit;
    }

    case "==":
    case "!=": {
      const eq = looseEquals(fact.value, leaf.value);
      if (eq === null) return null;
      return leaf.operator === "==" ? eq : !eq;
    }

    default: {
      if (!unitsComparable(leaf, fact)) return null;
      const left = numericFactValue(leaf, fact, asOf);
      const right = asNumber(leaf.value);
      if (left === null || right === null) return null;
      switch (leaf.operator) {
        case ">=":
          return left >= right;
        case "<=":
          return left <= right;
        case ">":
          return left > right;
        case "<":
          return left < right;
      }
    }
  }
}

/* ------------------------------------------------------------ leaf evaluation */

interface DatedFact {
  fact: Fact;
  /** Null when `observedAt` is unparseable — recency is then unestablished. */
  ageDays: number | null;
}

export function evaluateLeaf(
  leaf: CriterionLeaf,
  patient: Patient,
  asOf: string,
): LeafOutcome {
  let candidates: Fact[] = patient.facts.filter((f) => factMatchesLeaf(leaf, f));

  if (candidates.length === 0 && leaf.predicate === "age") {
    candidates = [demographicAgeFact(patient, asOf)];
  }

  // Nothing in the record answers this. The whole project: UNKNOWN, never FAIL.
  if (candidates.length === 0) {
    return { verdict: "UNKNOWN", reason: "absent" };
  }

  const dated: DatedFact[] = candidates
    .map((fact) => ({ fact, ageDays: ageInDays(fact.observedAt, asOf) }))
    .sort((a, b) => {
      // Newest first. An undated fact sorts last: it cannot be shown to be recent.
      if (a.ageDays === null) return b.ageDays === null ? 0 : 1;
      if (b.ageDays === null) return -1;
      return a.ageDays - b.ageDays;
    });

  // A fact with no usable date can only count when the leaf has no window at all.
  const fresh = dated.filter(({ ageDays }) => {
    if (leaf.maxAgeDays === undefined) return true;
    return ageDays !== null && ageDays <= leaf.maxAgeDays;
  });

  // A fact exists but it is older than the criterion's window. Still UNKNOWN —
  // and we hand back the stale fact so the UI can say "197 days, window is 14".
  if (fresh.length === 0) {
    const mostRecent = dated[0];
    return {
      verdict: "UNKNOWN",
      reason: "stale",
      fact: mostRecent.fact,
      ageDays: mostRecent.ageDays ?? undefined,
    };
  }

  const quantified = UNIVERSAL_OPERATORS.has(leaf.operator) || SET_VALUED.has(leaf.predicate)
    ? fresh
    : [fresh[0]]; // a measurement is superseded by the newer measurement

  const results = quantified.map((d) => ({ ...d, ok: satisfies(leaf, d.fact, asOf) }));
  const cite = (d: DatedFact): Pick<LeafOutcome, "fact" | "ageDays"> => ({
    fact: d.fact,
    ageDays: d.ageDays ?? undefined,
  });

  if (UNIVERSAL_OPERATORS.has(leaf.operator)) {
    // "no prior EGFR TKI" — one violating fact settles it.
    const violation = results.find((r) => r.ok === false);
    if (violation) {
      return { verdict: "FAIL", reason: "contradicted", ...cite(violation) };
    }
    if (results.some((r) => r.ok === null)) {
      return { verdict: "UNKNOWN", reason: "unsupported", ...cite(results[0]) };
    }
    return { verdict: "PASS", reason: "satisfied", ...cite(results[0]) };
  }

  // "prior osimertinib" — one matching fact settles it.
  const hit = results.find((r) => r.ok === true);
  if (hit) {
    return { verdict: "PASS", reason: "satisfied", ...cite(hit) };
  }
  if (results.some((r) => r.ok === null)) {
    return { verdict: "UNKNOWN", reason: "unsupported", ...cite(results[0]) };
  }
  return { verdict: "FAIL", reason: "contradicted", ...cite(results[0]) };
}

/* ------------------------------------------------------------- polarity tools */

/**
 * Which protocol section a criterion came from, read off its leaves.
 * `mixed` means a group conjoins both kinds; see `isEliminating`.
 *
 * A NOT deliberately does NOT flip this. The leaf's `type` records the section
 * the compiler found the text in, and a NOT is logic *inside* that section:
 * "no untreated brain metastases" is an inclusion requirement written as
 * NOT(has brain metastases). The rolled-up verdict already has the NOT applied
 * by Kleene, so flipping the type here as well would negate twice and let the
 * patient with brain metastases sail through.
 */
export function criterionType(node: CriterionNode): LeafType | "mixed" {
  if (node.kind === "leaf") return node.type;
  const kinds = new Set(node.children.map(criterionType));
  return kinds.size === 1 ? [...kinds][0] : "mixed";
}

/**
 * Does this rolled-up verdict knock the patient out?
 *
 * Judged on whole top-level criteria, never on individual leaves — a leaf that
 * FAILs inside `OR(EGFR L858R, EGFR exon19del)` must not eliminate anyone when
 * its sibling passes. Contract rule 6, enforced here.
 *
 * A `mixed` group is read as an inclusion: its rolled-up FAIL means every
 * branch was decided against the patient either way. Exclusion-PASS semantics
 * cannot apply to a group that is not purely an exclusion.
 */
export function isEliminating(verdict: Verdict, type: LeafType | "mixed"): boolean {
  return type === "exclusion" ? verdict === "PASS" : verdict === "FAIL";
}

/**
 * Verdict in patient-facing polarity: "did the patient clear this criterion".
 * Negates exclusions, so matching an exclusion reads as FAIL. UNKNOWN stays
 * UNKNOWN, because Kleene NOT leaves it alone. Use this for display and for
 * anything that reasons about eligibility rather than about the criterion.
 */
export function eligibilityVerdict(verdict: Verdict, type: LeafType): Verdict {
  return type === "exclusion" ? not(verdict) : verdict;
}

/** Every leaf in a trial, by criterion id. Used by elasticity and the audit. */
export function indexLeaves(trial: Trial): Map<string, CriterionLeaf> {
  const out = new Map<string, CriterionLeaf>();
  const visit = (node: CriterionNode): void => {
    if (node.kind === "leaf") {
      out.set(node.id, node);
      return;
    }
    node.children.forEach(visit);
  };
  trial.criteria.forEach(visit);
  return out;
}

/* ----------------------------------------------------------------- evaluate */

const weightOf = (tier: number): number => TIER_WEIGHT[tier] ?? 1;

/**
 * One patient against one trial: a cell per leaf, each with a verdict, a reason
 * and both citations, plus the roll-up the worklist sorts on.
 *
 * Pure. Same inputs, same output, forever — `asOf` is the only notion of now.
 */
export function evaluate(
  patient: Patient,
  trial: Trial,
  asOf: string,
  options: EvaluateOptions = {},
): PairResult {
  if (ageInDays(asOf, asOf) === null) {
    // Everything downstream measures against this. Failing loudly beats
    // emitting a cube full of UNKNOWNs that look like missing clinical data.
    throw new TypeError(`evaluate: asOf is not a valid ISO date: ${JSON.stringify(asOf)}`);
  }

  const cells: CubeCell[] = [];
  let eliminated = false;

  const walk = (node: CriterionNode): Verdict => {
    if (node.kind === "leaf") {
      const outcome = evaluateLeaf(node, patient, asOf);
      cells.push({
        patientId: patient.id,
        nctId: trial.nctId,
        criterionId: node.id,
        verdict: outcome.verdict,
        reason: outcome.reason,
        // The trial's own words. Guaranteed non-empty by the contract schema.
        criterionCitation: node.sourceSpan,
        // The record's words, whenever a fact carried the verdict — including a
        // stale one, so the UI can show what it found and why it did not count.
        chartCitation: outcome.fact?.sourceQuote,
        tier: node.tier,
        pFavorable: node.pFavorable,
        observedAt: outcome.fact?.observedAt,
        ageDays: outcome.ageDays,
      });
      return outcome.verdict;
    }
    return combine(node.op, node.children.map(walk));
  };

  for (const entry of trial.criteria) {
    const verdict = walk(entry);
    if (isEliminating(verdict, criterionType(entry))) {
      eliminated = true;
      if (options.shortCircuit) break;
    }
  }

  let passCount = 0;
  let failCount = 0;
  let unknownCount = 0;
  let resolutionCost = 0;
  let expectedValue = 0;

  for (const cell of cells) {
    if (cell.verdict === "PASS") passCount++;
    else if (cell.verdict === "FAIL") failCount++;
    else {
      unknownCount++;
      // What it costs to find out, and what finding out is worth. Both are
      // summed over the unresolved cells only — a settled cell costs nothing
      // and buys nothing.
      const w = weightOf(cell.tier);
      resolutionCost += w;
      expectedValue += (cell.pFavorable ?? 0) / w;
    }
  }

  return {
    patientId: patient.id,
    nctId: trial.nctId,
    eliminated,
    passCount,
    failCount,
    unknownCount,
    resolutionCost,
    expectedValue,
    cells,
  };
}

/**
 * Which criteria are actually holding this patient out of this trial.
 *
 * Answered by counterfactual, not by reading leaf verdicts: neutralise one leaf
 * to UNKNOWN, re-roll the tree from the cells we already have, and see whether
 * the patient is still eliminated. That is the only formulation that survives
 * nesting — reading raw leaf verdicts would blame a branch of an OR that failed
 * harmlessly, and would blame nothing at all underneath a NOT.
 *
 * Note what it does not return: if two independent criteria each eliminate the
 * patient, neither is listed, because relaxing either one alone changes
 * nothing. That is exactly the "excluded by this criterion alone" the
 * elasticity sweep needs.
 *
 * Needs a full cube — pass a result computed without `shortCircuit`.
 */
export function blockingCriterionIds(trial: Trial, result: PairResult): string[] {
  const byId = new Map(result.cells.map((c) => [c.criterionId, c]));
  if (!eliminatedFromCells(trial, byId)) return [];

  const out: string[] = [];
  for (const id of indexLeaves(trial).keys()) {
    const cell = byId.get(id);
    if (cell === undefined) continue;
    const relaxed = new Map(byId);
    relaxed.set(id, { ...cell, verdict: "UNKNOWN" });
    if (!eliminatedFromCells(trial, relaxed)) out.push(id);
  }
  return out;
}

/** Is this patient eliminated, judged from a set of cells alone? */
export function eliminatedFromCells(
  trial: Trial,
  byId: Map<string, CubeCell>,
): boolean {
  return trial.criteria.some((entry) =>
    isEliminating(rollUp(entry, byId), criterionType(entry)),
  );
}

/** Re-roll a subtree from cells already computed, without re-evaluating facts. */
function rollUp(node: CriterionNode, byId: Map<string, CubeCell>): Verdict {
  if (node.kind === "leaf") return byId.get(node.id)?.verdict ?? "UNKNOWN";
  return combine(node.op, node.children.map((c) => rollUp(c, byId)));
}

/** The full cube for a cohort. Patient-major, then trial, both input order. */
export function evaluateAll(
  patients: readonly Patient[],
  trials: readonly Trial[],
  asOf: string,
  options: EvaluateOptions = {},
): PairResult[] {
  const out: PairResult[] = [];
  for (const patient of patients) {
    for (const trial of trials) {
      out.push(evaluate(patient, trial, asOf, options));
    }
  }
  return out;
}
