import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import cubeOracle from "@/fixtures/cube.sample.json";
import { buildEvalReport } from "@/app/_data/eval";
import { AS_OF, loadClaims, loadCoverage, loadInputs, loadLandscape } from "@/app/_data/inputs";
import { buildPayerView } from "@/app/_data/payer";
import { buildReadModels } from "@/app/_data/readModels";
import { buildLandscape } from "@/components/landscape/build";
import { CLAIMS_STUB } from "@/components/payer/stub";

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

test("meta header-strip counts match a fresh engine run", () => {
  expect(committed("meta")).toMatchObject(fresh.strip);
});

test("inputs written for the app are the inputs the engine ran on", () => {
  expect(committed("trials")).toEqual(JSON.parse(JSON.stringify(trials)));
  expect(committed("patients")).toEqual(JSON.parse(JSON.stringify(patients)));
});

test("landscape.json is the compiler file when it has analytes, else derived from the same trials", () => {
  const compiled = loadLandscape(ROOT);
  expect(committed("landscape")).toEqual(compiled?.landscape ?? buildLandscape(trials));
});

test("payer.json is evaluate() over claims patients or the labelled stub", () => {
  const claims = loadClaims(ROOT);
  const fixtures = trials.filter((t) => /^NCT07001\d+$/.test(t.nctId));
  expect(committed("payer")).toEqual(
    JSON.parse(
      JSON.stringify(
        buildPayerView(
          claims?.patients ?? CLAIMS_STUB,
          fixtures,
          AS_OF,
          loadCoverage(ROOT),
          claims ? claims.source : "stub",
        ),
      ),
    ),
  );
});

test("eval.json matches a fresh harness run and is never silently marked human", () => {
  const report = buildEvalReport(ROOT, patients, trials, AS_OF);
  expect(committed("eval")).toEqual(report);
  expect(report.labelSource.toLowerCase()).not.toBe("human");
});

test("the engine's cube over the sample fixtures agrees with the hand-worked oracle", () => {
  const sampleIds = new Set(cubeOracle.map((p) => `${p.patientId}|${p.nctId}`));
  const generated = committed("cube").filter((p: { patientId: string; nctId: string }) =>
    sampleIds.has(`${p.patientId}|${p.nctId}`),
  );
  const generatedIds = new Set(generated.map((p: { patientId: string; nctId: string }) => `${p.patientId}|${p.nctId}`));
  const expected = cubeOracle.filter((p) => generatedIds.has(`${p.patientId}|${p.nctId}`));
  expect(generated.length).toBeGreaterThan(0);
  const key = (p: { patientId: string; nctId: string }) => `${p.patientId}|${p.nctId}`;
  expect([...generated].sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
    [...expected].sort((a, b) => key(a).localeCompare(key(b))),
  );
});
