/**
 * Fidelity verification — does the compiled tree mean what the protocol meant?
 *
 * The eval harness measures whether the engine evaluates a tree correctly, which
 * a deterministic engine under 791 tests largely proves by construction. This
 * measures the risk one step upstream, in the compiler, where nothing measured it
 * before: a protocol that said "A or B" compiling into a tree that demands both.
 *
 *   render.ts           a criterion tree as a sentence a clinician can check
 *   fidelity.ts         the stratified 77-row sample, deterministic in its seed
 *   ingest-fidelity.ts  human verdicts back in, error rate and detector recall
 *
 * Pure throughout. `emit.test.ts` is the only file that touches disk.
 */
export {
  criterionSide,
  hasDisjunction,
  leavesOf,
  renderCriterion,
  renderLeaf,
  renderNode,
  renderOutline,
} from "./render";
export {
  DEFAULT_SEED,
  DEFAULT_UNFLAGGED_SAMPLE,
  buildFidelitySheet,
  flaggedTrialIds,
  looksLikeFlattenedDisjunction,
  reviewUnits,
  sourceContextOf,
  sourceSpansOf,
  type BuildSheetOptions,
  type FidelityRow,
  type FidelitySheet,
  type ReviewUnit,
} from "./fidelity";
export {
  ingestFidelity,
  wilson95,
  type FidelityReport,
  type StratumResult,
  type WilsonInterval,
} from "./ingest-fidelity";
