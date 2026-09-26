/**
 * The engine's public surface — docs/CONTRACT.md §8.
 *
 * Pure functions over contract types. No fetch, no fs, no database, no clock:
 * `asOf` is the only notion of now, and it is always a parameter.
 *
 *   kleene      three-valued AND / OR / NOT
 *   evaluate    one patient x one trial → PairResult, a cell per criterion
 *   provenance  what chart / claims / patient report are each allowed to prove
 *   priors      VOI priors resolved from data/prevalence.json, with citations
 *   coverage    what share of real trial criteria a data source can answer
 *   claims      what a claims-only cohort can and cannot be told
 *   load        reading other lanes' files without trusting their shape
 *   rank        worklist order, both axes of the cube
 *   elasticity  what one threshold costs the cohort
 *   equity      exclusion rate per criterion, grouped by race
 *   match       stable many-to-one assignment under capacity
 *   calendar    forward schedule: who becomes enrollable, and when
 *   federated   per-site counts and curves, with small-cell suppression
 *   setcover    which tests to order, under a budget
 *
 * bench.ts holds seeded synthetic data and the cube runner for the scale
 * benchmark. It is deliberately not re-exported here: those patients measure
 * throughput and are never demo data (contract §9).
 *
 * On the polarity of an exclusion cell's verdict, read the header of
 * evaluate.ts and the note in docs/HANDOFF.md before rendering anything: use
 * `eligibilityVerdict()` for display.
 */
export { AND_IDENTITY, OR_IDENTITY, and, combine, not, or } from "./kleene";
export { addDays, ageInDays, daysBetween, parseIsoDate, toIsoDate } from "./time";
export {
  blockingCriterionIds,
  criterionType,
  eligibilityVerdict,
  eliminatedFromCells,
  evaluate,
  evaluateAll,
  evaluateWithNotes,
  evaluateLeaf,
  indexLeaves,
  isEliminating,
  matchingFacts,
  type EvaluateOptions,
  type PairResultWithNotes,
} from "./evaluate";
export {
  canConfirm,
  ceilingFor,
  claimsConfirmablePredicates,
  explainCeiling,
  type Provenance,
  type ProvenanceCeiling,
  type ProvenanceNote,
} from "./provenance";
export {
  compareCandidates,
  rank,
  rankPatientsForTrial,
  rankTrialsForPatient,
  travelMinutesFor,
  type RankContext,
} from "./rank";
export {
  MAX_SWEEP_POINTS,
  sweep,
  sweepThresholds,
  sweepableLeaves,
  withLeafValue,
} from "./elasticity";
export { equityAudit, equityAuditAcross } from "./equity";
export {
  DEFAULT_MIN_CELL_SIZE,
  complementarySuppression,
  federate,
  isSuppressed,
  suppress,
  type FederateOptions,
  type FederatedCounts,
  type FederatedElasticityCurve,
  type FederatedElasticityPoint,
  type FederatedReport,
  type FederatedTrialReport,
  type SiteCohort,
  type SuppressedCount,
  type SuppressionMarker,
} from "./federated";
export {
  actionableEntries,
  calendar,
  timeBoundCrossings,
  type CalendarEntry,
  type CalendarOptions,
} from "./calendar";
export {
  countBlockingPairs,
  match,
  matchAdhoc,
  phaseRank,
  type MatchOptions,
} from "./match";
export {
  orderKey,
  planTestOrders,
  type SetCoverOptions,
  type SetCoverPlan,
  type TestOrder,
  type UnlockedPair,
} from "./setcover";
export {
  DEFAULT_PFAVORABLE,
  PRIOR_DOMAIN,
  PrevalenceFile,
  PrevalenceRecord,
  buildPriorTable,
  parsePrevalenceFile,
  type PriorTable,
  type PriorTableOptions,
  type ResolvedPrior,
} from "./priors";
export {
  answerableBy,
  explainAnswerability,
  type Answerability,
} from "./provenance";
export {
  claimsCoverage,
  type CoverageOptions,
  type CoverageReport,
  type CoverageTally,
  type TrialCoverage,
} from "./coverage";
export { claimsCohortEvaluation, type ClaimsCohortReport } from "./claims";
export { loadPatients, loadTrials, type LoadResult } from "./load";
