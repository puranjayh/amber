import type { Assignment, PairResult, Patient, Trial } from "@/src/contracts";
import {
  blockingCriterionIds,
  equityAudit,
  evaluateAll,
  match,
  matchAdhoc,
  rank,
  sweep,
  sweepableLeaves,
  sweepThresholds,
} from "@/src/engine";
import { worklistStrip } from "@/components/worklist/strip";
import { PRESENTATION_PAIR } from "./inputs";
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
function pinHeroWorklist(
  worklist: WorklistRow[],
  cube: PairResult[],
  pin: { patientId: string; nctId: string },
): WorklistRow[] {
  const pair = cube.find((row) => row.patientId === pin.patientId && row.nctId === pin.nctId);
  if (!pair) return worklist;
  const blocking = pair.cells.filter((cell) => cell.verdict === "UNKNOWN").sort((a, b) => a.tier - b.tier);
  const pinned = worklistRow(pair, blocking);
  const index = worklist.findIndex((row) => row.patientId === pin.patientId);
  if (index === -1) return [pinned, ...worklist];
  const next = worklist.slice();
  next[index] = pinned;
  return next;
}

export function buildReadModels(
  trials: Trial[],
  patients: Patient[],
  asOf: string,
  pin: { patientId: string; nctId: string } = PRESENTATION_PAIR,
): ReadModels {
  if (process.env.NEXT_RUNTIME) {
    throw new Error("buildReadModels is a generate.ts build step. Do not evaluate the cube inside Next.");
  }
  const ctx = { patients, trials };
  const trialById = new Map(trials.map((t) => [t.nctId, t]));
  const cube = evaluateAll(patients, trials, asOf);

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

  const worklist = pinHeroWorklist(
    [
      ...rank(bestLive, ctx).map((pair) =>
        worklistRow(pair, pair.cells.filter((c) => c.verdict === "UNKNOWN").sort((a, b) => a.tier - b.tier)),
      ),
      ...eliminatedRows.sort((a, b) => a.patientId.localeCompare(b.patientId)),
    ],
    cube,
    pin,
  );

  const elasticity: ElasticitySweep[] = [];
  for (const trial of trials) {
    for (const leaf of sweepableLeaves(trial)) {
      let grid: number[];
      try {
        grid = sweepThresholds(leaf);
      } catch (error) {
        console.warn(`${trial.nctId} ${leaf.id}: ${error instanceof Error ? error.message : error} — skipped`);
        continue;
      }
      if (typeof leaf.value !== "number" || !grid.includes(leaf.value)) {
        console.warn(`${trial.nctId} ${leaf.id}: protocol value ${leaf.value} is off its sweep grid — skipped`);
        continue;
      }
      elasticity.push({ nctId: trial.nctId, criterionId: leaf.id, points: sweep(trial, leaf.id, patients, asOf) });
    }
  }

  const equity = trials.map((trial) => ({ nctId: trial.nctId, rows: equityAudit(trial, patients, asOf) }));

  const assignments = [
    matchAdhoc(patients, trials, asOf),
    match(patients, trials, asOf),
    match(patients, trials, asOf, { dapTargets: true }),
  ];

  return { cube, worklist, strip: worklistStrip(cube), elasticity, equity, assignments };
}

/**
 * The full cube is 203 × 134 and too large to ship. Keep the pairs the console
 * actually opens: every worklist row, and every patient on the presentation trial.
 */
export function publishCube(
  cube: PairResult[],
  worklist: WorklistRow[],
  pinNctId: string,
): PairResult[] {
  const worklistKeys = new Set(worklist.map((row) => `${row.patientId}|${row.nctId}`));
  return cube.filter(
    (pair) => worklistKeys.has(`${pair.patientId}|${pair.nctId}`) || pair.nctId === pinNctId,
  );
}
