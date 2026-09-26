/**
 * AMBER build contract — FROZEN AT 00:00 SATURDAY.
 *
 * This is the only module any lane may import from. See docs/CONTRACT.md.
 * Changes before the freeze: announce in Discord. After: all four people agree.
 *
 * Requires: npm i zod
 */
import { z } from "zod";

/* ------------------------------------------------------------------ verdicts */

/**
 * Three-valued, and the third value is the point.
 *  PASS    a fact satisfies the criterion AND is recent enough to count
 *  FAIL    a fact contradicts it
 *  UNKNOWN the record is silent, or the data is stale beyond the criterion's window
 *
 * Absence of evidence is never evidence of absence. Missing data is UNKNOWN, never FAIL.
 */
export const Verdict = z.enum(["PASS", "FAIL", "UNKNOWN"]);
export type Verdict = z.infer<typeof Verdict>;

/** Why the engine reached that verdict. Drives the UI copy and the eval labels. */
export const Reason = z.enum([
  "satisfied",   // PASS  — fact matched, within window
  "contradicted",// FAIL  — fact directly violates the criterion
  "absent",      // UNKNOWN — nothing in the record answers this
  "stale",       // UNKNOWN — a fact exists but is older than maxAgeDays
  "unsupported", // UNKNOWN — criterion type the engine cannot evaluate yet
]);
export type Reason = z.infer<typeof Reason>;

/* --------------------------------------------------------------- predicates */

export const Predicate = z.enum([
  "age",
  "lab_value",
  "biomarker",
  "prior_therapy",
  "performance_status",
  "diagnosis",
  "staging",
  "washout",
  "comorbidity",
  "contraindication",
]);
export type Predicate = z.infer<typeof Predicate>;

export const Operator = z.enum([">=", "<=", ">", "<", "==", "!=", "in", "not_in"]);
export type Operator = z.infer<typeof Operator>;

/**
 * What it costs to resolve an UNKNOWN. This ranking is our contribution — a lab run on
 * tissue pathology already holds outranks a lab that needs a new biopsy.
 *  0 orderable on an EXISTING specimen (reflex NGS on an archived block)
 *  1 routine blood draw or in-clinic assessment (CBC, ECOG score, ECG)
 *  2 imaging (restaging CT for RECIST measurability)
 *  3 invasive (new biopsy)
 *  4 time-bound — cannot be bought, only waited (washout, waiting period)
 */
export const Tier = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4),
]);
export type Tier = z.infer<typeof Tier>;

/* ---------------------------------------------------------------- criteria */

export const CriterionLeaf = z.object({
  kind: z.literal("leaf"),
  id: z.string(),                          // "INC-6a", "EXC-1"
  type: z.enum(["inclusion", "exclusion"]),
  predicate: Predicate,
  operator: Operator,

  /** Threshold. Arrays are for `in` / `not_in`, e.g. a drug class member list. */
  value: z.union([z.number(), z.string(), z.boolean(), z.array(z.string())]),
  unit: z.string().optional(),             // "/uL", "mL/min", "ms"

  analyte: z.string().optional(),          // "ANC", "albumin", "QTc"
  drugClass: z.string().optional(),        // "EGFR_TKI", "PLATINUM"
  members: z.array(z.string()).optional(), // resolved class members, via RxNorm

  /** Recency window. A fact older than this is UNKNOWN (stale), never PASS. */
  maxAgeDays: z.number().int().positive().optional(),

  /** Free-text qualifiers the compiler could not express structurally. */
  countingRule: z.string().optional(),

  tier: Tier,
  pFavorable: z.number().min(0).max(1).optional(), // prior from data/prevalence.json

  /** Elasticity hooks. Numeric leaves MUST set these or the sweep cannot run. */
  sweepable: z.boolean().default(false),
  sweepRange: z.tuple([z.number(), z.number()]).optional(),
  sweepStep: z.number().positive().optional(),

  /** Verbatim protocol text this leaf was compiled from. Required — it is a citation. */
  sourceSpan: z.string().min(1),
});
export type CriterionLeaf = z.infer<typeof CriterionLeaf>;

export type CriterionGroup = {
  kind: "group";
  op: "AND" | "OR" | "NOT";
  children: CriterionNode[];
  sourceSpan?: string;
};
export type CriterionNode = CriterionLeaf | CriterionGroup;

/** Recursive. Nested booleans are PRESERVED — never flatten an OR into a list. */
export const CriterionNode: z.ZodType<CriterionNode> = z.lazy(() =>
  z.union([
    CriterionLeaf,
    z.object({
      kind: z.literal("group"),
      op: z.enum(["AND", "OR", "NOT"]),
      children: z.array(CriterionNode).min(1),
      sourceSpan: z.string().optional(),
    }),
  ])
);

/* ------------------------------------------------------------------- trials */

export const Trial = z.object({
  nctId: z.string().regex(/^NCT\d{8}$/),
  title: z.string(),
  phase: z.string(),                       // "PHASE3"
  condition: z.string(),
  slots: z.number().int().nonnegative(),   // remaining capacity, for the matching
  siteDistanceMinutes: z.number().optional(),
  criteria: z.array(CriterionNode),

  /** Diversity Action Plan targets, when the sponsor has filed them (FDORA 2022). */
  dapTargets: z.record(z.string(), z.number().min(0).max(1)).optional(),

  compilerConfidence: z.number().min(0).max(1),
  /** Set by validation failure OR by back-translation divergence. Excluded from demo. */
  needsHumanReview: z.boolean().default(false),
});
export type Trial = z.infer<typeof Trial>;

/* ----------------------------------------------------------------- patients */

/** One extracted clinical fact. `sourceQuote` is mandatory — it is half of every cell. */
export const Fact = z.object({
  predicate: Predicate,
  analyte: z.string().optional(),
  drugClass: z.string().optional(),
  value: z.union([z.number(), z.string(), z.boolean()]),
  unit: z.string().optional(),

  /** ISO date. Staleness is computed against the evaluation's `asOf`, never Date.now(). */
  observedAt: z.string(),

  sourceQuote: z.string().min(1),          // the exact sentence from the record
  sourceDoc: z.string(),                   // "CBC 2026-09-18", "pathology 2026-03-12"

  /** Which legally separate plane this came from. Claims can prove FAIL, rarely PASS. */
  provenance: z.enum(["chart", "claims", "patient_reported"]).default("chart"),
});
export type Fact = z.infer<typeof Fact>;

/** Preferences come from the patient. Medical facts never do. */
export const PatientPreferences = z.object({
  maxTravelMinutes: z.number().optional(),
  maxExtraVisitsPerMonth: z.number().optional(),
  acceptsPlacebo: z.boolean().optional(),
}).partial();
export type PatientPreferences = z.infer<typeof PatientPreferences>;

export const Patient = z.object({
  id: z.string(),                          // "PT-4417" — synthetic, always
  age: z.number().int(),
  sex: z.enum(["F", "M", "other", "unknown"]),
  race: z.string(),                        // needed for the DAP equity audit
  ethnicity: z.string().optional(),
  zip: z.string().optional(),
  travelMinutes: z.number().optional(),
  facts: z.array(Fact),
  preferences: PatientPreferences.optional(),
});
export type Patient = z.infer<typeof Patient>;

/* --------------------------------------------------------------- the cube */

/**
 * One cell of CUBE[patient][trial][criterion]. Every product is a slice of this:
 *   fix a patient  → the oncologist's view
 *   fix a trial    → the coordinator's worklist
 *   fix a criterion→ elasticity
 *   fix a criterion, group by race → the equity audit
 *   match both axes under capacity → market clearing
 */
export const CubeCell = z.object({
  patientId: z.string(),
  nctId: z.string(),
  criterionId: z.string(),
  verdict: Verdict,
  reason: Reason,

  /** Both citations. A cell without `criterionCitation` is a bug. */
  criterionCitation: z.string().min(1),    // the trial's own words
  chartCitation: z.string().optional(),    // the record's words; absent when UNKNOWN

  tier: Tier,
  pFavorable: z.number().min(0).max(1).optional(),
  observedAt: z.string().optional(),
  ageDays: z.number().optional(),          // for showing "197 days, window is 14"
});
export type CubeCell = z.infer<typeof CubeCell>;

/** Roll-up of one patient against one trial. */
export const PairResult = z.object({
  patientId: z.string(),
  nctId: z.string(),
  eliminated: z.boolean(),
  passCount: z.number().int(),
  failCount: z.number().int(),
  unknownCount: z.number().int(),
  /** Sum of tier weights over unresolved unknowns — the price of finding out. */
  resolutionCost: z.number(),
  /** Σ pFavorable / cost. Higher is a better use of the next test. */
  expectedValue: z.number(),
  cells: z.array(CubeCell),
});
export type PairResult = z.infer<typeof PairResult>;

/* ------------------------------------------------------- derived read models */

export const ElasticityPoint = z.object({
  threshold: z.number(),
  eligibleCount: z.number().int(),
  excludedByThisAlone: z.number().int(),
  /** Eligible count per subgroup at this threshold — feeds the equity audit. */
  bySubgroup: z.record(z.string(), z.number().int()).optional(),
});
export type ElasticityPoint = z.infer<typeof ElasticityPoint>;

export const EquityRow = z.object({
  criterionId: z.string(),
  label: z.string(),
  /** Share of otherwise-eligible candidates this criterion excludes, per subgroup. */
  exclusionRateBySubgroup: z.record(z.string(), z.number().min(0).max(1)),
  /** Largest pairwise gap, in percentage points. Sort the audit by this. */
  maxGapPoints: z.number(),
});
export type EquityRow = z.infer<typeof EquityRow>;

export const Assignment = z.object({
  mode: z.enum(["adhoc", "stable", "stable_dap"]),
  pairs: z.array(z.object({ patientId: z.string(), nctId: z.string() })),
  enrolled: z.number().int(),
  meanTravelMinutes: z.number(),
  /** Pairs where patient and trial would both rather swap. Stable matching → 0. */
  unstablePairs: z.number().int(),
  subgroupShare: z.record(z.string(), z.number()).optional(),
});
export type Assignment = z.infer<typeof Assignment>;

/* ------------------------------------------------------------------ fixtures */

export const TrialsFixture = z.array(Trial);
export const PatientsFixture = z.array(Patient);
export const CubeFixture = z.array(PairResult);

/** Hand-labelled ground truth. Written BEFORE the engine runs. Held out until Sunday. */
export const EvalLabel = z.object({
  patientId: z.string(),
  nctId: z.string(),
  criterionId: z.string(),
  expected: Verdict,
  expectedReason: Reason.optional(),
  labeller: z.string(),
  note: z.string().optional(),
});
export const EvalSet = z.array(EvalLabel);
export type EvalLabel = z.infer<typeof EvalLabel>;

/* ------------------------------------------------------------------ helpers */

/** Default tier weights for resolutionCost. Tier 4 is deliberately expensive: you
 *  cannot buy your way out of a washout period, you can only wait. */
export const TIER_WEIGHT: Record<number, number> = { 0: 1, 1: 2, 2: 6, 3: 20, 4: 30 };

export const TIER_LABEL: Record<number, string> = {
  0: "existing specimen",
  1: "blood draw or in-clinic",
  2: "imaging",
  3: "invasive",
  4: "time-bound",
};
