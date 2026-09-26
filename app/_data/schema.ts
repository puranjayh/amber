import { z } from "zod";
import { Assignment, ElasticityPoint, EquityRow, Operator, Reason, Tier, Verdict } from "@/src/contracts";

// Read models the generator writes and the app reads. Contract types where they exist;
// these wrappers add only the references the bare contract shapes leave out.

export const ElasticitySweep = z.object({
  nctId: z.string(),
  criterionId: z.string(),
  points: z.array(ElasticityPoint),
});
export type ElasticitySweep = z.infer<typeof ElasticitySweep>;

export const EquitySet = z.object({ nctId: z.string(), rows: z.array(EquityRow) });
export type EquitySet = z.infer<typeof EquitySet>;

export const Assignments = z.array(Assignment);

export const LandscapeThreshold = z.object({
  threshold: z.number(),
  count: z.number().int(),
  percentage: z.number().min(0).max(1),
});
export const LandscapeAnalyte = z.object({
  analyte: z.string(),
  totalTrials: z.number().int(),
  flaggedTrials: z.number().int(),
  operators: z.array(
    z.object({
      operator: Operator,
      totalTrials: z.number().int(),
      flaggedTrials: z.number().int(),
      thresholds: z.array(LandscapeThreshold),
    }),
  ),
});
export const CriteriaLandscape = z.object({
  generatedFromTrials: z.number().int(),
  analytes: z.array(LandscapeAnalyte),
});
export type LandscapeAnalyte = z.infer<typeof LandscapeAnalyte>;
export type CriteriaLandscape = z.infer<typeof CriteriaLandscape>;

export const WorklistStrip = z.object({
  pairsEvaluated: z.number().int(),
  eligibleNow: z.number().int(),
  oneTier0Away: z.number().int(),
});
export type WorklistStrip = z.infer<typeof WorklistStrip>;

export const WorklistRow = z.object({
  patientId: z.string(),
  /** Best trial by rank(); when every trial eliminates, the one with the fewest blockers. */
  nctId: z.string(),
  eliminated: z.boolean(),
  passCount: z.number().int(),
  failCount: z.number().int(),
  unknownCount: z.number().int(),
  /** Open UNKNOWNs for a live pair; the eliminating criteria for an eliminated one. */
  blocking: z.array(
    z.object({ criterionId: z.string(), verdict: Verdict, reason: Reason, tier: Tier }),
  ),
  /** Highest tier among open unknowns — the hardest step left. Null when none are open. */
  resolutionTier: Tier.nullable(),
  resolutionCost: z.number(),
  expectedValue: z.number(),
});
export type WorklistRow = z.infer<typeof WorklistRow>;

export const Meta = z.object({
  asOf: z.string(),
  sources: z.array(z.string()),
  patients: z.number().int(),
  trials: z.number().int(),
  cells: z.number().int(),
  pairsEvaluated: z.number().int(),
  eligibleNow: z.number().int(),
  oneTier0Away: z.number().int(),
  /** Compiled protocols in the cube, excluding the pinned presentation trial. */
  realProtocols: z.number().int().default(0),
  /** Git tree hash of src/engine at generation time — ties every number to engine code. */
  engineTree: z.string(),
});
export type Meta = z.infer<typeof Meta>;

export const CoverageFigure = z
  .object({
    beneficiaries: z.number().optional(),
    years: z.string().optional(),
    caption: z.string().optional(),
    source: z.string().optional(),
    figure: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();
export type CoverageFigure = z.infer<typeof CoverageFigure>;

export const PredicateCoverage = z.object({
  predicate: z.string(),
  count: z.number().int(),
  answerable: z.number().int(),
  rate: z.number(),
  kind: z.enum(["certain", "ambiguous", "never"]),
});
export const SideCoverage = z.object({
  count: z.number().int(),
  answerable: z.number().int(),
  rate: z.number(),
});
export const ClaimsCoverage = z
  .object({
    trials: z.number().int(),
    criteria: z.number().int(),
    answerable: z.number().int(),
    ambiguous: z.number().int(),
    lowerRate: z.number(),
    upperRate: z.number(),
    inclusions: SideCoverage,
    exclusions: SideCoverage,
    byPredicate: z.array(PredicateCoverage),
    source: z.string().default("data/compiled/coverage.json"),
  })
  .passthrough();
export type ClaimsCoverage = z.infer<typeof ClaimsCoverage>;

export const SettledExclusion = z.object({
  patientId: z.string(),
  nctId: z.string(),
  criterionId: z.string(),
  predicate: z.string(),
  kind: z.enum(["drug fill", "comorbidity", "concomitant fill"]),
  claimLine: z.string(),
  sourceDoc: z.string().optional(),
});
export type SettledExclusion = z.infer<typeof SettledExclusion>;

export const ChartNeed = z.object({
  need: z.string(),
  predicate: z.string(),
  analyte: z.string().optional(),
  why: z.string(),
  criterionIds: z.array(z.string()),
  patientIds: z.array(z.string()),
});
export type ChartNeed = z.infer<typeof ChartNeed>;

export const PayerView = z.object({
  headline: z.string(),
  beneficiaries: z.number().int(),
  /** Protocols the claims extract was scored against. */
  protocols: z.number().int().default(0),
  settled: z.array(SettledExclusion),
  needs: z.array(ChartNeed),
  coverage: ClaimsCoverage.nullable(),
  source: z.enum(["data/claims/patients.json", "stub"]),
});
export type PayerView = z.infer<typeof PayerView>;

/** Answers only the patient can give. Driver is app-owned — contracts are frozen. */
export const Driver = z.enum(["self", "family", "friend", "none"]);
export type Driver = z.infer<typeof Driver>;

export const PortalAnswers = z.object({
  maxTravelMinutes: z.number().nonnegative().optional(),
  maxExtraVisitsPerMonth: z.number().nonnegative().optional(),
  acceptsPlacebo: z.boolean().optional(),
  driver: Driver.optional(),
});
export type PortalAnswers = z.infer<typeof PortalAnswers>;

export const HcpTrialRow = z.object({
  nctId: z.string(),
  title: z.string(),
  phase: z.string(),
  unknownCount: z.number().int(),
  expectedValue: z.number(),
  resolutionCost: z.number(),
  travelMinutes: z.number().nullable(),
  visitBurden: z.number(),
  likelyPlacebo: z.boolean(),
  worth: z.number(),
});
export type HcpTrialRow = z.infer<typeof HcpTrialRow>;

export const HcpPatientRow = z.object({
  patientId: z.string(),
  unknownCount: z.number().int(),
  expectedValue: z.number(),
  resolutionCost: z.number(),
  travelMinutes: z.number().nullable(),
  bestNctId: z.string(),
  liveTrials: z.number().int(),
  portal: PortalAnswers,
  trials: z.array(HcpTrialRow),
});
export type HcpPatientRow = z.infer<typeof HcpPatientRow>;

export const HcpPhysician = z.object({
  id: z.string(),
  name: z.string(),
  site: z.string(),
  patients: z.array(HcpPatientRow),
});
export type HcpPhysician = z.infer<typeof HcpPhysician>;

export const HcpPanel = z.object({
  channel: z.literal("Impiricus"),
  defaultPhysicianId: z.string(),
  physicians: z.array(HcpPhysician),
});
export type HcpPanel = z.infer<typeof HcpPanel>;

export const EvalReport = z.object({
  labelSource: z.string(),
  evaluatedCells: z.number().int(),
  issues: z.array(
    z.object({
      patientId: z.string(),
      nctId: z.string(),
      criterionId: z.string(),
      message: z.string(),
    }),
  ),
  confusionMatrix: z.record(z.string(), z.record(z.string(), z.number())),
  precision: z.number().nullable(),
  recall: z.number().nullable(),
  unknownAgreement: z.number().nullable(),
  unknownRecall: z.number().nullable(),
  byVerdict: z.record(
    z.string(),
    z.object({ precision: z.number().nullable(), recall: z.number().nullable() }),
  ),
  disagreements: z.array(
    z.object({
      patientId: z.string(),
      trialTitle: z.string(),
      nctId: z.string(),
      criterionId: z.string(),
      expected: Verdict,
      actual: Verdict,
      criterionCitation: z.string(),
      chartCitation: z.string().optional(),
    }),
  ),
});
export type EvalReport = z.infer<typeof EvalReport>;
