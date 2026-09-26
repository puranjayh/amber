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
import {
  ceilingFor,
  explainCeiling,
  type Provenance,
  type ProvenanceCeiling,
  type ProvenanceNote,
} from "./provenance";
import type { PriorTable } from "./priors";
import { ageInDays, daysBetween, parseIsoDate } from "./time";

/* ------------------------------------------------------------------ options */

export interface EvaluateOptions {
  /**
   * Prevalence priors for the VOI ranking. When supplied, a leaf's `pFavorable`
   * is resolved from the table — with its citation — in preference to whatever
   * the compiler inferred from protocol prose. Build one with
   * `buildPriorTable(parsePrevalenceFile(json).records)`.
   *
   * Omit it and nothing changes: the compiled value is used as before.
   */
  priors?: PriorTable;

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
  /**
   * Set when a provenance ceiling capped the verdict. `CubeCell` is frozen and
   * cannot carry it, so `evaluate()` exposes the same notes on the side — see
   * `PairResultNotes`.
   */
  provenanceNote?: ProvenanceNote;
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
 * `analyte` always filters: it names WHICH QUESTION is being asked. An albumin
 * result is not a partial answer about ANC, it is an answer to a different
 * question, so an ANC criterion stays UNKNOWN in its presence.
 *
 * `drugClass` is subtler, because records state therapy history two ways and
 * the field means something different in each:
 *
 *   { value: true, drugClass: "EGFR_TKI" }   the class names the question, and
 *                                            the boolean is the answer — so it
 *                                            filters, exactly like an analyte.
 *                                            A PLATINUM flag must not be read
 *                                            as an answer about EGFR TKIs.
 *   { value: "pembrolizumab" }               a drug name, with no class. It
 *                                            answers the general question
 *                                            "what has this patient had", so it
 *                                            is relevant, and whether it lands
 *                                            inside the class is settled by the
 *                                            comparison against `members`.
 *
 * Hence: a fact that declares a class must match the leaf's class; a fact that
 * declares none is relevant and left to the comparison. Filtering out the
 * unclassed facts as well would leave every drug-class exclusion permanently
 * UNKNOWN for every patient treated with something else, and nobody would ever
 * clear an exclusion.
 *
 * `matchingFacts` exposes the same relevance test, because the eligibility
 * calendar needs the date-bearing facts behind a time-bound criterion.
 */
export function matchingFacts(leaf: CriterionLeaf, patient: Patient): Fact[] {
  return relevantFacts(leaf, patient).map((e) => e.fact);
}

/* ------------------------------------------------------------- fact indexing */

/**
 * A patient's facts bucketed by the questions they answer, newest first.
 *
 * Without this, every leaf rescans and re-sorts the whole record: a 300-trial
 * cube over 20-criterion protocols is ~17 scans of ~13 facts per pair, which
 * dominates the run. Bucketing once per patient turns that into a map lookup.
 */
/**
 * A fact with everything the hot path needs already computed.
 *
 * The date is parsed, and the three strings a comparison lower-cases are
 * lower-cased once. That last part is the single biggest cost in a cube run over
 * real records: a membership test does `norm(String(fact.value))`, and one
 * Synthea patient has 1,113 `prior_therapy` facts against 431 prior-therapy
 * criteria, so the same value is re-normalised hundreds of thousands of times per
 * patient. It belongs to the fact, not to the comparison.
 */
interface IndexedFact {
  fact: Fact;
  /** UTC-midnight millis, or null when `observedAt` is not a date. */
  at: number | null;
  /** `norm(String(fact.value))`. */
  valueKey: string;
  /** `norm(fact.drugClass)`, or null. */
  classKey: string | null;
  /** `norm(fact.unit)`, or null. */
  unitKey: string | null;
}

interface FactIndex {
  byPredicate: Map<Predicate, IndexedFact[]>;
  /** `predicate|analyte`, lower-cased. */
  byAnalyte: Map<string, IndexedFact[]>;
}

/**
 * Memoised on the patient object. Purely a cache — same patient, same index —
 * and a WeakMap so a cohort can be collected normally. It pays for itself many
 * times over because every read model evaluates the same patient against many
 * trials, and the elasticity sweep does it once per threshold.
 *
 * The one requirement: do not mutate `patient.facts` in place after evaluating.
 * Nothing in the engine does, and the contract treats facts as extracted
 * evidence rather than mutable state.
 */
const FACT_INDEX = new WeakMap<Patient, FactIndex>();

const NO_FACTS: readonly IndexedFact[] = [];

/** Everything about a fact that a comparison would otherwise recompute. */
function indexedKeys(fact: Fact): Omit<IndexedFact, "fact"> {
  return {
    at: parseIsoDate(fact.observedAt),
    valueKey: norm(String(fact.value)),
    classKey: fact.drugClass === undefined ? null : norm(fact.drugClass),
    unitKey: fact.unit === undefined ? null : norm(fact.unit),
  };
}

function factIndex(patient: Patient): FactIndex {
  const cached = FACT_INDEX.get(patient);
  if (cached !== undefined) return cached;

  // Newest first, undated last: the order every leaf wants, established once.
  const ordered: (IndexedFact & { i: number })[] = patient.facts
    .map((fact, i) => ({ fact, ...indexedKeys(fact), i }))
    .sort((a, b) => {
      if (a.at === null) return b.at === null ? a.i - b.i : 1;
      if (b.at === null) return -1;
      return b.at - a.at || a.i - b.i;
    });

  const index: FactIndex = { byPredicate: new Map(), byAnalyte: new Map() };
  for (const entry of ordered) {
    const { fact } = entry;
    const list = index.byPredicate.get(fact.predicate);
    if (list === undefined) index.byPredicate.set(fact.predicate, [entry]);
    else list.push(entry);

    if (fact.analyte !== undefined) {
      const key = `${fact.predicate}|${norm(fact.analyte)}`;
      const byKey = index.byAnalyte.get(key);
      if (byKey === undefined) index.byAnalyte.set(key, [entry]);
      else byKey.push(entry);
    }
  }
  FACT_INDEX.set(patient, index);
  return index;
}

/** The facts that speak to this leaf, newest first. Avoids copying where it can. */
function relevantFacts(leaf: CriterionLeaf, patient: Patient): readonly IndexedFact[] {
  const index = factIndex(patient);
  const key = leafCache(leaf).bucketKey;
  const bucket =
    key !== null ? index.byAnalyte.get(key) : index.byPredicate.get(leaf.predicate);
  if (bucket === undefined) return NO_FACTS;

  // A fact that declares a drug class must match the leaf's; see factMatchesLeaf.
  const wanted = leafCache(leaf).drugClass;
  if (wanted === null) return bucket;
  if (!bucket.some((e) => e.classKey !== null && e.classKey !== wanted)) return bucket;
  return bucket.filter((e) => e.classKey === null || e.classKey === wanted);
}

function factMatchesLeaf(leaf: CriterionLeaf, fact: Fact): boolean {
  if (fact.predicate !== leaf.predicate) return false;

  if (leaf.analyte !== undefined) {
    if (fact.analyte === undefined) return false;
    if (norm(fact.analyte) !== norm(leaf.analyte)) return false;
  }

  if (
    leaf.drugClass !== undefined &&
    fact.drugClass !== undefined &&
    norm(fact.drugClass) !== norm(leaf.drugClass)
  ) {
    return false;
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
/**
 * The synthesised age candidate, cached per patient and `asOf`.
 *
 * 261 of the compiled criteria are age thresholds, so without this we allocate a
 * Fact per age criterion per pair for no reason — the value never varies.
 */
const AGE_CANDIDATE = new WeakMap<Patient, { asOf: string; candidates: IndexedFact[] }>();

function demographicAgeCandidates(patient: Patient, asOf: string): IndexedFact[] {
  const cached = AGE_CANDIDATE.get(patient);
  if (cached !== undefined && cached.asOf === asOf) return cached.candidates;
  const fact = demographicAgeFact(patient, asOf);
  const candidates: IndexedFact[] = [{ fact, ...indexedKeys(fact) }];
  AGE_CANDIDATE.set(patient, { asOf, candidates });
  return candidates;
}

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

/**
 * Everything derived from a leaf that does not depend on the patient, computed
 * once per criterion instead of once per patient per criterion.
 *
 * Lower-casing a drug-class list, building the bucket key and normalising units
 * were each a measurable share of a full cube run — 300 trials over a few
 * thousand patients re-derives them millions of times, and they belong to the
 * criterion, not to the comparison.
 */
interface LeafCache {
  /** `predicate|analyte` for the fact index, or null when the leaf has no analyte. */
  bucketKey: string | null;
  drugClass: string | null;
  unit: string | null;
  /** Membership list for in / not_in. Null when the compiler gave us no list. */
  members: ReadonlySet<string> | null;
  /** The provenance ceiling for this leaf's predicate, by source. */
  ceiling: Record<Provenance, ProvenanceCeiling>;
}

const LEAF_CACHE = new WeakMap<CriterionLeaf, LeafCache>();

function leafCache(leaf: CriterionLeaf): LeafCache {
  const cached = LEAF_CACHE.get(leaf);
  if (cached !== undefined) return cached;
  const list = Array.isArray(leaf.value) ? leaf.value : leaf.members;
  const built: LeafCache = {
    bucketKey: leaf.analyte === undefined ? null : `${leaf.predicate}|${norm(leaf.analyte)}`,
    drugClass: leaf.drugClass === undefined ? null : norm(leaf.drugClass),
    unit: leaf.unit === undefined ? null : norm(leaf.unit),
    members: list === undefined || list.length === 0 ? null : new Set(list.map(norm)),
    ceiling: {
      chart: ceilingFor("chart", leaf.predicate),
      claims: ceilingFor("claims", leaf.predicate),
      patient_reported: ceilingFor("patient_reported", leaf.predicate),
    },
  };
  LEAF_CACHE.set(leaf, built);
  return built;
}

/**
 * `asOf` parsed, remembered one value deep.
 *
 * A cube run uses a single `asOf` for millions of staleness checks, and parsing
 * a date is a regex plus a round-trip through `Date`. The calendar alternates
 * between two values, which this still handles; anything with no locality just
 * pays the parse it would have paid anyway.
 */
let lastAsOf = "\u0000";
let lastAsOfMs: number | null = null;

function asOfMillis(asOf: string): number | null {
  if (asOf !== lastAsOf) {
    lastAsOf = asOf;
    lastAsOfMs = parseIsoDate(asOf);
  }
  return lastAsOfMs;
}

const MS_PER_DAY = 86_400_000;

/** A unit mismatch is not converted, it is refused. Contract rule 5. */
function unitsComparable(leaf: CriterionLeaf, entry: IndexedFact): boolean {
  const wanted = leafCache(leaf).unit;
  if (wanted === null || entry.unitKey === null) return true;
  return wanted === entry.unitKey;
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
function looseEquals(
  factValue: Fact["value"],
  target: CriterionLeaf["value"],
  factValueKey: string,
): boolean | null {
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

  return factValueKey === norm(String(target));
}

/**
 * Does this one fact satisfy the leaf's operator?
 * true = satisfied, false = violated, null = not comparable (→ `unsupported`).
 */
function satisfies(leaf: CriterionLeaf, entry: IndexedFact, asOf: string): boolean | null {
  const fact = entry.fact;
  switch (leaf.operator) {
    case "in":
    case "not_in": {
      const hay = leafCache(leaf).members;
      if (hay === null) return null;
      // Three ways the fact can land in the class: it names a member drug, it
      // names the class itself, or it declares the class the compiler resolved
      // via RxNorm. Records say "unnamed EGFR TKI" more often than you would
      // like, and that still answers the question.
      const hit =
        hay.has(entry.valueKey) ||
        (entry.classKey !== null &&
          (hay.has(entry.classKey) || entry.classKey === leafCache(leaf).drugClass));
      return leaf.operator === "in" ? hit : !hit;
    }

    case "==":
    case "!=": {
      const eq = looseEquals(fact.value, leaf.value, entry.valueKey);
      if (eq === null) return null;
      return leaf.operator === "==" ? eq : !eq;
    }

    default: {
      if (!unitsComparable(leaf, entry)) return null;
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

/**
 * Evaluate one criterion against one patient.
 *
 * Written as a single pass over the fact bucket with no intermediate arrays.
 * Real records are lopsided: in the Synthea cohort one patient carries 1,113
 * `prior_therapy` facts, and `prior_therapy` leaves name no analyte, so each of
 * the 431 prior-therapy criteria in the pool looks at the whole bucket. Building
 * a `{fact, age}` array and filtering it, per leaf, was pure overhead.
 *
 * Measured on 233 real trials against the 200-patient Synthea cohort, dropping
 * the intermediate arrays was worth about 24% and pre-normalising the fact keys
 * (see `IndexedFact`) about another 34%, for 1.32M to 2.19M cells/s overall.
 * Behaviour is unchanged — the suite that proves it is the one that passed
 * before, verdict counts identical at every cohort size.
 *
 * What is left is the algorithmic floor for this question. The dominant pattern
 * is `comorbidity == "..."` with no analyte, 1,396 criteria of it, and the
 * dominant outcome is that the patient does not have the condition. Proving that
 * no fact matches means looking at every fact in the bucket, so indexing values
 * would speed up the hits and not the misses. Worth revisiting only with an
 * index complete enough to conclude absence, which means encoding the coercions
 * `looseEquals` performs — a lot of fragility for the case that is already fast.
 */
export function evaluateLeaf(
  leaf: CriterionLeaf,
  patient: Patient,
  asOf: string,
): LeafOutcome {
  let candidates: readonly IndexedFact[] = relevantFacts(leaf, patient);

  if (candidates.length === 0 && leaf.predicate === "age") {
    candidates = demographicAgeCandidates(patient, asOf);
  }

  // Nothing in the record answers this. The whole project: UNKNOWN, never FAIL.
  if (candidates.length === 0) {
    return { verdict: "UNKNOWN", reason: "absent" };
  }

  const now = asOfMillis(asOf);
  const window = leaf.maxAgeDays;

  /** Age in whole days, clamped at zero exactly as `ageInDays` clamps. */
  const ageOf = (at: number | null): number | null =>
    at === null || now === null ? null : Math.max(0, Math.round((now - at) / MS_PER_DAY));

  const cite = (fact: Fact, ageDays: number | null): Pick<LeafOutcome, "fact" | "ageDays"> => ({
    fact,
    ageDays: ageDays ?? undefined,
  });

  const quantified =
    UNIVERSAL_OPERATORS.has(leaf.operator) || SET_VALUED.has(leaf.predicate);
  const universal = UNIVERSAL_OPERATORS.has(leaf.operator);

  // Candidates arrive newest-first with undated last, so the first is the one to
  // cite when nothing is fresh enough to count.
  const newest = candidates[0];

  let sawFresh = false;
  /** First fresh fact whose source may not produce the verdict it would have. */
  let cappedFact: Fact | null = null;
  let cappedAge: number | null = null;
  /** First fresh fact the comparison could not evaluate at all. */
  let incomparable = false;
  /** Newest fresh fact, cited when the outcome is a plain PASS or FAIL. */
  let freshFact: Fact | null = null;
  let freshAge: number | null = null;

  const ceilings = leafCache(leaf).ceiling;

  for (const entry of candidates) {
    const { fact, at } = entry;
    const ageDays = ageOf(at);
    // A fact with no usable date can only count when the leaf has no window.
    if (window !== undefined && (ageDays === null || ageDays > window)) continue;

    const raw = satisfies(leaf, entry, asOf);
    const ceiling = ceilings[fact.provenance];
    const capped = ceiling === "no_verdict" || (ceiling === "no_confirm" && raw === true);

    if (!sawFresh && !capped) {
      // The newest fact whose source may actually testify. For a scalar
      // measurement this is the only one considered: a newer reading supersedes
      // an older one, but "a CBC was billed today" is not a reading at all, so
      // we fall through it to last week's chart result.
      sawFresh = true;
      freshFact = fact;
      freshAge = ageDays;
    }

    if (capped) {
      if (cappedFact === null) {
        cappedFact = fact;
        cappedAge = ageDays;
      }
      // For a scalar, a capped newest reading does not end the search.
      if (!quantified) continue;
    } else if (raw === null) {
      incomparable = true;
    } else if (universal) {
      // "no prior EGFR TKI" — one violating fact settles it, whatever its
      // source. Ruling out is exactly what a claim is entitled to do.
      if (raw === false) {
        return { verdict: "FAIL", reason: "contradicted", ...cite(fact, ageDays) };
      }
    } else if (raw === true) {
      // "prior osimertinib" — one matching fact settles it.
      return { verdict: "PASS", reason: "satisfied", ...cite(fact, ageDays) };
    }

    // A scalar measurement is decided by the newest source that can testify.
    if (!quantified && !capped) break;
  }

  // A fact exists but nothing is inside the criterion's window. Still UNKNOWN —
  // and we hand back the stale fact so the UI can say "197 days, window is 14".
  if (!sawFresh && cappedFact === null) {
    return {
      verdict: "UNKNOWN",
      reason: "stale",
      ...cite(newest.fact, ageOf(newest.at)),
    };
  }

  // A capped source is the most informative thing we have. Cite it and say why:
  // for a universal claim, one source that cannot testify makes the whole
  // assertion unprovable, and for a scalar it means nothing could answer.
  if (cappedFact !== null && (!sawFresh || universal)) {
    return {
      verdict: "UNKNOWN",
      reason: "unsupported",
      ...cite(cappedFact, cappedAge),
      provenanceNote: explainCeiling(cappedFact.provenance, leaf.predicate),
    };
  }

  if (incomparable || freshFact === null) {
    const fact = freshFact ?? cappedFact ?? newest.fact;
    const age = freshFact !== null ? freshAge : cappedFact !== null ? cappedAge : ageOf(newest.at);
    return { verdict: "UNKNOWN", reason: "unsupported", ...cite(fact, age) };
  }

  // Nothing matched a positive operator, or everything cleared a negative one.
  return universal
    ? { verdict: "PASS", reason: "satisfied", ...cite(freshFact, freshAge) }
    : { verdict: "FAIL", reason: "contradicted", ...cite(freshFact, freshAge) };
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

/**
 * Every leaf in a trial, in document order, one entry per occurrence.
 *
 * Use this and not `indexLeaves` for counting. `indexLeaves` keys by criterion
 * id, so a trial whose compiler emitted the same id twice — NCT07631624 in the
 * current corpus has two `INC-1` and two `INC-2`, a two-cohort protocol whose
 * arms were numbered independently — silently loses a leaf from the map.
 */
export function allLeaves(trial: Trial): CriterionLeaf[] {
  const out: CriterionLeaf[] = [];
  const visit = (node: CriterionNode): void => {
    if (node.kind === "leaf") out.push(node);
    else node.children.forEach(visit);
  };
  trial.criteria.forEach(visit);
  return out;
}

/**
 * Criterion ids that appear more than once in one trial, with their counts.
 *
 * A collision is a data defect with teeth, not a cosmetic one. `evaluate` emits a
 * cell per leaf occurrence, but the roll-up looks cells up by id, so both tree
 * positions read whichever cell was written last and the trial verdict can come
 * out wrong. The pipeline check asserts this is empty across the corpus so the
 * failure is named rather than silent.
 */
export function duplicateLeafIds(trial: Trial): Record<string, number> {
  const seen = new Map<string, number>();
  for (const leaf of allLeaves(trial)) {
    seen.set(leaf.id, (seen.get(leaf.id) ?? 0) + 1);
  }
  const dupes: Record<string, number> = {};
  for (const [id, n] of seen) if (n > 1) dupes[id] = n;
  return dupes;
}

/**
 * Every leaf in a trial, by criterion id.
 *
 * Deduplicates by id, which is what lookup callers want and what counting callers
 * must not use — see `allLeaves` and `duplicateLeafIds`.
 */
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
/**
 * A `PairResult` plus the provenance notes for its capped cells, keyed by
 * criterion id.
 *
 * They travel beside the result rather than inside it because `CubeCell` is
 * frozen and has nowhere to put them. Every note is derivable from the inputs,
 * so nothing is lost by keeping them out of the cube — but a UI that wants to
 * say "claims can rule this out but not confirm it" should call
 * `evaluateWithNotes` rather than re-deriving the rule itself.
 */
export interface PairResultWithNotes {
  result: PairResult;
  provenanceNotes: Record<string, ProvenanceNote>;
}

/** As `evaluate`, and also hands back why any cell was capped by its source. */
export function evaluateWithNotes(
  patient: Patient,
  trial: Trial,
  asOf: string,
  options: EvaluateOptions = {},
): PairResultWithNotes {
  const notes: Record<string, ProvenanceNote> = {};
  const result = evaluate(patient, trial, asOf, options, notes);
  return { result, provenanceNotes: notes };
}

export function evaluate(
  patient: Patient,
  trial: Trial,
  asOf: string,
  options: EvaluateOptions = {},
  /** Internal: `evaluateWithNotes` passes a sink to collect capped-cell notes. */
  noteSink?: Record<string, ProvenanceNote>,
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
      if (noteSink !== undefined && outcome.provenanceNote !== undefined) {
        noteSink[node.id] = outcome.provenanceNote;
      }
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
        // A cited prior beats an inferred one. See priors.ts on why this is
        // polarity-aware: for an exclusion, favourable means NOT having it.
        pFavorable: options.priors?.resolve(node).pFavorable ?? node.pFavorable,
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
