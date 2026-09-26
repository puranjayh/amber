import { CubeFixture, PatientsFixture, TrialsFixture, type PairResult, type Patient, type Trial } from "@/src/contracts";
import assignmentsJson from "./assignments.json";
import cubeJson from "./cube.json";
import elasticityJson from "./elasticity.json";
import equityJson from "./equity.json";
import metaJson from "./meta.json";
import patientsJson from "./patients.json";
import trialsJson from "./trials.json";
import worklistJson from "./worklist.json";
import { Assignments, ElasticitySweep, EquitySet, Meta, WorklistRow } from "./schema";

// The only place the app reads data. Every file here is written by generate.ts from engine
// output, and components/generated.test.ts fails if any of them drifts from a fresh run.
const trials = TrialsFixture.parse(trialsJson);
const patients = PatientsFixture.parse(patientsJson);
const cube = CubeFixture.parse(cubeJson);
const worklist = WorklistRow.array().parse(worklistJson);
const sweeps = ElasticitySweep.array().parse(elasticityJson);
const equity = EquitySet.array().parse(equityJson);
const assignments = Assignments.parse(assignmentsJson);
export const meta = Meta.parse(metaJson);

export const asOf = meta.asOf;

/** The pair we present on stage (fixtures/ORACLE.md: exactly two unknowns). */
export const DEMO = { patientId: "PT-4401", nctId: "NCT07001001" } as const;

export const getTrials = (): Trial[] => trials;
export const getPatients = (): Patient[] => patients;

/** Hand-built fixture ids — the 3×3 pair picker and the demo stay on these. */
export const fixturePatientIds = () => patients.filter((p) => /^PT-\d+$/.test(p.id)).map((p) => p.id);
export const fixtureTrialIds = () => trials.filter((t) => /^NCT07001\d+$/.test(t.nctId)).map((t) => t.nctId);
export const getCube = (): PairResult[] => cube;
export const getWorklist = () => worklist;
export const getSweeps = () => sweeps;
export const getAssignments = () => assignments;

export const getTrial = (nctId: string) => trials.find((t) => t.nctId === nctId);
export const getPatient = (id: string) => patients.find((p) => p.id === id);
export const getPair = (patientId: string, nctId: string) =>
  cube.find((p) => p.patientId === patientId && p.nctId === nctId);
export const getSweep = (nctId: string, criterionId: string) =>
  sweeps.find((s) => s.nctId === nctId && s.criterionId === criterionId);
export const getEquity = (nctId: string) => equity.find((e) => e.nctId === nctId);

/** Patients per subgroup — the denominator every equity and elasticity number sits on. */
export function subgroupSizes(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of patients) out[p.race] = (out[p.race] ?? 0) + 1;
  return out;
}
