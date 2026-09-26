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

export const LoopRole = z.enum(["coordinator", "patient", "physician"]);
export type LoopRole = z.infer<typeof LoopRole>;

export const NudgeKind = z.enum(["fill_preferences", "enrol_patient", "trial_suggestion", "trial_update"]);
export type NudgeKind = z.infer<typeof NudgeKind>;

export const NudgeStatus = z.enum(["pending", "seen", "done"]);
export type NudgeStatus = z.infer<typeof NudgeStatus>;

/** Live store row. Null in the table until the patient fills the portal. */
export const LoopPreference = z.object({
  patientId: z.string(),
  maxTravelMinutes: z.number(),
  maxVisitsPerMonth: z.number(),
  acceptsPlacebo: z.boolean(),
  driver: Driver,
  updatedAt: z.string(),
});
export type LoopPreference = z.infer<typeof LoopPreference>;

export const LoopNudge = z.object({
  id: z.string(),
  kind: NudgeKind,
  fromRole: LoopRole,
  toRole: LoopRole,
  patientId: z.string(),
  nctId: z.string().nullable(),
  status: NudgeStatus,
  createdAt: z.string(),
  /** One coordinator action → many patients. HCP renders one card per batch. */
  batchId: z.string().optional(),
  /**
   * Doctor-only account of a registry change. Never render this on the patient
   * portal, and strip it from patient responses.
   */
  detail: z.string().optional(),
  /** True until the physician releases it. Automatic mode writes false. */
  held: z.boolean().optional(),
  /** Identity of the registry change, so the same fact is not sent twice. */
  changeKey: z.string().optional(),
});
export type LoopNudge = z.infer<typeof LoopNudge>;

export const ReleaseMode = z.enum(["review", "auto"]);
export type ReleaseMode = z.infer<typeof ReleaseMode>;

export const ReleaseSetting = z.object({
  physicianId: z.string(),
  mode: ReleaseMode,
});
export type ReleaseSetting = z.infer<typeof ReleaseSetting>;

export const RegistrySite = z.object({
  facility: z.string(),
  city: z.string(),
  state: z.string().optional(),
  country: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
});
export type RegistrySite = z.infer<typeof RegistrySite>;

/** One ClinicalTrials.gov study, as last fetched. Not a patient fact. */
export const RegistryStudy = z.object({
  nctId: z.string(),
  overallStatus: z.string(),
  lastUpdatePostDate: z.string().nullable(),
  primaryCompletionDate: z.string().nullable(),
  /** enrollmentInfo.count. Absent on snapshots fetched before this field existed. */
  enrollmentCount: z.number().int().nonnegative().optional(),
  sites: z.array(RegistrySite),
});
export type RegistryStudy = z.infer<typeof RegistryStudy>;

export const RegistrySnapshot = z.object({
  nctId: z.string(),
  fetchedAt: z.string(),
  study: RegistryStudy,
});
export type RegistrySnapshot = z.infer<typeof RegistrySnapshot>;

export const PhysicianNote = z.object({
  physicianId: z.string(),
  text: z.string(),
  updatedAt: z.string(),
});
export type PhysicianNote = z.infer<typeof PhysicianNote>;

export const LoopState = z.object({
  backend: z.enum(["supabase", "file"]),
  preferences: z.array(LoopPreference),
  nudges: z.array(LoopNudge),
  notes: z.array(PhysicianNote).default([]),
  registry: z.array(RegistrySnapshot).default([]),
  releases: z.array(ReleaseSetting).default([]),
});
export type LoopState = z.infer<typeof LoopState>;

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
      expectedReason: z.string().optional(),
      criterionCitation: z.string(),
      chartCitation: z.string().optional(),
    }),
  ),
});
export type EvalReport = z.infer<typeof EvalReport>;
