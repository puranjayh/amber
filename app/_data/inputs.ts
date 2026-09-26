import { existsSync, readFileSync } from "node:fs";
import { PatientsFixture, TrialsFixture, type Patient, type Trial } from "@/src/contracts";

/** The evaluation date the fixtures are written against (fixtures/ORACLE.md). */
export const AS_OF = "2026-09-25";

/** Engine inputs: the fixtures, plus the data lane's population once it lands. */
export function loadInputs(root: string): { trials: Trial[]; patients: Patient[]; sources: string[] } {
  const read = (rel: string): unknown => JSON.parse(readFileSync(root + rel, "utf8"));
  const sources = ["fixtures/trials.sample.json", "fixtures/patients.sample.json"];

  const trials = TrialsFixture.parse(read("fixtures/trials.sample.json")).filter((t) => !t.needsHumanReview);
  let patients = PatientsFixture.parse(read("fixtures/patients.sample.json"));

  if (existsSync(root + "data/patients.json")) {
    const population = PatientsFixture.parse(read("data/patients.json"));
    const seen = new Set(patients.map((p) => p.id));
    patients = [...patients, ...population.filter((p) => !seen.has(p.id))];
    sources.push("data/patients.json");
  }

  return { trials, patients, sources };
}
