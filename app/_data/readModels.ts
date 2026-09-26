import type { Assignment, PairResult, Patient, Trial } from "@/src/contracts";
import {
  blockingCriterionIds,
  equityAudit,
  evaluate,
  match,
  matchAdhoc,
  rank,
  sweep,
  sweepableLeaves,
  sweepThresholds,
} from "@/src/engine";
import { worklistStrip } from "@/components/worklist/strip";
import type { ElasticitySweep, EquitySet, WorklistRow, WorklistStrip } from "./schema";

export type ReadModels = {
  cube: PairResult[];
  worklist: WorklistRow[];
  strip: WorklistStrip;
  elasticity: ElasticitySweep[];
  equity: EquitySet[];
  assignments: Assignment[];
};

function worklistRow(pair: PairResult, blocking: PairResult["cells"]): WorklistRow {
  const open = pair.cells.filter((c) => c.verdict === "UNKNOWN");
  return {
    patientId: pair.patientId,
    nctId: pair.nctId,
    eliminated: pair.eliminated,
    passCount: pair.passCount,
    failCount: pair.failCount,
    unknownCount: pair.unknownCount,
    blocking: blocking.map(({ criterionId, verdict, reason, tier }) => ({ criterionId, verdict, reason, tier })),
    resolutionTier: open.length
      ? (Math.max(...open.map((c) => c.tier)) as WorklistRow["resolutionTier"])
      : null,
    resolutionCost: pair.resolutionCost,
    expectedValue: pair.expectedValue,
  };
}

/**
 * Every derived number the app shows, from engine calls only. Pure: same inputs, same
 * output, which is what lets a test prove the committed JSON is current engine output.
 */
export function buildReadModels(trials: Trial[], patients: Patient[], asOf: string): ReadModels {
  const ctx = { patients, trials };
  const trialById = new Map(trials.map((t) => [t.nctId, t]));
  const cube = patients.flatMap((p) => trials.map((t) => evaluate(p, t, asOf)));

  const bestLive: PairResult[] = [];
  const eliminatedRows: WorklistRow[] = [];
  for (const patient of patients) {
    const pairs = cube.filter((r) => r.patientId === patient.id);
    const [best] = rank(pairs, ctx);
    if (best) {
      bestLive.push(best);
      continue;
    }
    const closest = pairs
      .map((pair) => {
        const ids = new Set(blockingCriterionIds(trialById.get(pair.nctId)!, pair));
        return { pair, blockers: pair.cells.filter((c) => ids.has(c.criterionId)) };
      })
      .sort((a, b) => a.blockers.length - b.blockers.length || a.pair.nctId.localeCompare(b.pair.nctId))[0];
    if (closest) eliminatedRows.push(worklistRow(closest.pair, closest.blockers));
  }

  const worklist = [
    ...rank(bestLive, ctx).map((pair) =>
      worklistRow(pair, pair.cells.filter((c) => c.verdict === "UNKNOWN").sort((a, b) => a.tier - b.tier)),
    ),
    ...eliminatedRows.sort((a, b) => a.patientId.localeCompare(b.patientId)),
  ];

  const elasticity = trials.flatMap((trial) =>
    sweepableLeaves(trial).map((leaf) => {
      if (typeof leaf.value !== "number" || !sweepThresholds(leaf).includes(leaf.value)) {
        throw new Error(`${trial.nctId} ${leaf.id}: protocol value ${leaf.value} is off its sweep grid`);
      }
      return { nctId: trial.nctId, criterionId: leaf.id, points: sweep(trial, leaf.id, patients, asOf) };
    }),
  );

  const equity = trials.map((trial) => ({ nctId: trial.nctId, rows: equityAudit(trial, patients, asOf) }));

  const assignments = [
    matchAdhoc(patients, trials, asOf),
    match(patients, trials, asOf),
    match(patients, trials, asOf, { dapTargets: true }),
  ];

  return { cube, worklist, strip: worklistStrip(cube), elasticity, equity, assignments };
}
