import {
  Assignment,
  CubeFixture,
  ElasticityPoint,
  EquityRow,
  PatientsFixture,
  TrialsFixture,
  type PairResult,
  type Patient,
  type Trial,
} from "@/src/contracts";
import cubeJson from "@/fixtures/cube.sample.json";
import patientsJson from "@/fixtures/patients.sample.json";
import trialsJson from "@/fixtures/trials.sample.json";
import elasticitySample from "./elasticity.sample.json";
import assignmentSample from "./assignment.sample.json";
import equitySample from "./equity.sample.json";

// The only place the app reads data. Parsed with the contract schemas so a fixture that
// drifts from the contract fails loudly at load instead of rendering wrong.
const trials = TrialsFixture.parse(trialsJson);
const patients = PatientsFixture.parse(patientsJson);
const cube = CubeFixture.parse(cubeJson);

/** The evaluation date the fixture cube was computed against (fixtures/ORACLE.md). */
export const asOf = "2026-09-25";

export const HERO = { patientId: "PT-4401", nctId: "NCT07001001" } as const;

// Hand-written placeholder until the engine's sweep output ships as a fixture.
// ElasticityPoint[] carries no criterion reference, so the binding lives here.
const elasticity = {
  nctId: "NCT07001001",
  criterionId: "INC-5",
  points: ElasticityPoint.array().parse(elasticitySample),
};

// Hand-written placeholder until the engine's equityAudit() output ships as a fixture.
const equity = { nctId: "NCT07001001", rows: EquityRow.array().parse(equitySample) };

export function getEquity() {
  return equity;
}

// Hand-written placeholder until the engine's match()/matchAdhoc() output ships as a fixture.
const assignments = Assignment.array().parse(assignmentSample);

export function getAssignments(): Assignment[] {
  return assignments;
}

export function getTrials(): Trial[] {
  return trials;
}

export function getPatients(): Patient[] {
  return patients;
}

export function getTrial(nctId: string): Trial | undefined {
  return trials.find((t) => t.nctId === nctId);
}

export function getPatient(id: string): Patient | undefined {
  return patients.find((p) => p.id === id);
}

export function getPair(patientId: string, nctId: string): PairResult | undefined {
  return cube.find((p) => p.patientId === patientId && p.nctId === nctId);
}

export function getCube(): PairResult[] {
  return cube;
}

export function getElasticity() {
  return elasticity;
}

export function getPairsForPatient(patientId: string): PairResult[] {
  return cube.filter((p) => p.patientId === patientId);
}
