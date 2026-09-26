import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import cubeOracle from "@/fixtures/cube.sample.json";
import { AS_OF, loadInputs } from "@/app/_data/inputs";
import { buildReadModels } from "@/app/_data/readModels";

// Proves the committed app/_data/*.json is exactly what the current engine produces.
// If this fails, run the generator — never edit the JSON by hand.
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const committed = (name: string) => JSON.parse(readFileSync(`${ROOT}app/_data/${name}.json`, "utf8"));
const { trials, patients } = loadInputs(ROOT);
const fresh = JSON.parse(JSON.stringify(buildReadModels(trials, patients, AS_OF)));

test.each(["cube", "worklist", "elasticity", "equity", "assignments"] as const)(
  "app/_data/%s.json matches a fresh engine run",
  (name) => {
    expect(committed(name)).toEqual(fresh[name]);
  },
);

test("inputs written for the app are the inputs the engine ran on", () => {
  expect(committed("trials")).toEqual(JSON.parse(JSON.stringify(trials)));
  expect(committed("patients")).toEqual(JSON.parse(JSON.stringify(patients)));
});

test("the engine's cube over the sample fixtures agrees with the hand-worked oracle", () => {
  const sampleIds = new Set(cubeOracle.map((p) => `${p.patientId}|${p.nctId}`));
  const generated = committed("cube").filter((p: { patientId: string; nctId: string }) =>
    sampleIds.has(`${p.patientId}|${p.nctId}`),
  );
  const key = (p: { patientId: string; nctId: string }) => `${p.patientId}|${p.nctId}`;
  expect([...generated].sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
    [...cubeOracle].sort((a, b) => key(a).localeCompare(key(b))),
  );
});
