import { z } from "zod";
import { Assignment, ElasticityPoint, EquityRow, Reason, Tier, Verdict } from "@/src/contracts";

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
  /** Git tree hash of src/engine at generation time — ties every number to engine code. */
  engineTree: z.string(),
});
export type Meta = z.infer<typeof Meta>;
