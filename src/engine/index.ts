/**
 * The engine's public surface — docs/CONTRACT.md §8.
 *
 * Pure functions over contract types. No fetch, no fs, no database, no clock:
 * `asOf` is the only notion of now, and it is always a parameter.
 *
 *   kleene      three-valued AND / OR / NOT
 *   evaluate    one patient x one trial → PairResult, a cell per criterion
 *   rank        worklist order, both axes of the cube
 *   elasticity  what one threshold costs the cohort
 *   equity      exclusion rate per criterion, grouped by race
 *   match       stable many-to-one assignment under capacity
 *
 * On the polarity of an exclusion cell's verdict, read the header of
 * evaluate.ts and the note in docs/HANDOFF.md before rendering anything: use
 * `eligibilityVerdict()` for display.
 */
export { AND_IDENTITY, OR_IDENTITY, and, combine, not, or } from "./kleene";
export { ageInDays, daysBetween, parseIsoDate } from "./time";
export {
  blockingCriterionIds,
  criterionType,
  eligibilityVerdict,
  eliminatedFromCells,
  evaluate,
  evaluateAll,
  evaluateLeaf,
  indexLeaves,
  isEliminating,
  type EvaluateOptions,
} from "./evaluate";
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
export { match, matchAdhoc, phaseRank, type MatchOptions } from "./match";
