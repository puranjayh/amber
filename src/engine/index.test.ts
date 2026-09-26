/**
 * The barrel is the lane's contract with every other lane, and it is the one file
 * here that is edited by hand every time a module is added. A missing re-export
 * fails at someone else's import site, in their worktree, at 4am — so it is
 * cheaper to fail here.
 */
import { describe, expect, it } from "vitest";
import * as engine from "./index";

/** Every runtime value the engine means to publish. Types are checked by tsc. */
const PUBLIC_API = [
  // kleene
  "and", "or", "not", "combine", "AND_IDENTITY", "OR_IDENTITY",
  // time
  "parseIsoDate", "daysBetween", "ageInDays", "addDays", "toIsoDate",
  // evaluate
  "evaluate", "evaluateAll", "evaluateLeaf", "evaluateWithNotes",
  "blockingCriterionIds", "criterionType", "eligibilityVerdict",
  "eliminatedFromCells", "indexLeaves", "isEliminating", "matchingFacts",
  // provenance
  "ceilingFor", "canConfirm", "explainCeiling", "claimsConfirmablePredicates",
  "answerableBy", "explainAnswerability",
  // priors
  "buildPriorTable", "parsePrevalenceFile", "DEFAULT_PFAVORABLE", "PRIOR_DOMAIN",
  "PrevalenceRecord", "PrevalenceFile",
  // rank
  "rank", "rankTrialsForPatient", "rankPatientsForTrial", "compareCandidates",
  "travelMinutesFor",
  // elasticity
  "sweep", "sweepThresholds", "sweepableLeaves", "withLeafValue", "MAX_SWEEP_POINTS",
  // equity
  "equityAudit", "equityAuditAcross",
  // calendar
  "calendar", "timeBoundCrossings", "actionableEntries",
  // federated
  "federate", "suppress", "isSuppressed", "complementarySuppression",
  "DEFAULT_MIN_CELL_SIZE",
  // match
  "match", "matchAdhoc", "phaseRank", "countBlockingPairs",
  // setcover
  "planTestOrders", "orderKey",
  // coverage / claims / load
  "claimsCoverage", "claimsCohortEvaluation", "loadTrials", "loadPatients",
] as const;

describe("the public surface", () => {
  it.each(PUBLIC_API)("exports %s", (name) => {
    expect(engine[name as keyof typeof engine], `${name} is not exported`).toBeDefined();
  });

  it("exports nothing undefined", () => {
    for (const [name, value] of Object.entries(engine)) {
      expect(value, `${name} is exported as undefined`).toBeDefined();
    }
  });

  it("does not leak the benchmark harness", () => {
    // bench.ts generates synthetic patients and holds a clock. Neither belongs in
    // the engine's surface: contract §9 and rule 1.
    for (const name of ["syntheticCohort", "syntheticTrials", "runCube", "timeCube", "replicateCohort"]) {
      expect(engine).not.toHaveProperty(name);
    }
  });

  it("does not leak the test builders", () => {
    for (const name of ["leaf", "patient", "trial", "fact", "assertValid"]) {
      expect(engine).not.toHaveProperty(name);
    }
  });

  it("publishes every function the modules mean to publish", () => {
    // Guards the other direction: a module exporting something the barrel forgot.
    const exported = new Set(Object.keys(engine));
    const missing = PUBLIC_API.filter((n) => !exported.has(n));
    expect(missing).toEqual([]);
  });
});
