import {
  CubeFixture,
  PatientsFixture,
  TrialsFixture,
  type PairResult,
  type Patient,
  type Trial,
} from "@/src/contracts";
import {
  AS_OF,
  placeholderCube,
  placeholderPatients,
  placeholderTrials,
} from "./placeholder";

// The only place the app reads data. Swap these three inputs for the fixtures/*.json
// imports when they land; everything downstream is already typed against the contracts.
const trials = TrialsFixture.parse(placeholderTrials);
const patients = PatientsFixture.parse(placeholderPatients);
const cube = CubeFixture.parse(placeholderCube);

export const asOf = AS_OF;

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

export function getPairsForPatient(patientId: string): PairResult[] {
  return cube.filter((p) => p.patientId === patientId);
}
