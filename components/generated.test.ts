import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import cubeOracle from "@/fixtures/cube.sample.json";
import { buildEvalReport } from "@/app/_data/eval";
import { AS_OF, DEMO_POOL, PRESENTATION_PAIR, PRESENTATION_TRIAL, loadClaims, loadCoverage, loadInputs, loadLandscape, loadPayerTrials } from "@/app/_data/inputs";
import { buildPayerView } from "@/app/_data/payer";
import { publishCube } from "@/app/_data/readModels";
import { buildLandscape } from "@/components/landscape/build";
import { CLAIMS_STUB } from "@/components/payer/stub";

// Structural checks on the committed JSON. Do not call buildReadModels on the
// 133-trial pool here — that is generate.ts, a one-off, not a test.
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const committed = (name: string) => JSON.parse(readFileSync(`${ROOT}app/_data/${name}.json`, "utf8"));
const { trials, patients } = loadInputs(ROOT);

test("pool is 133 real protocols plus the pinned presentation trial", () => {
  expect(trials.filter((t) => t.nctId !== PRESENTATION_TRIAL)).toHaveLength(DEMO_POOL);
  expect(trials.some((t) => t.nctId === PRESENTATION_TRIAL)).toBe(true);
  expect(committed("trials")).toEqual(JSON.parse(JSON.stringify(trials)));
  expect(committed("patients")).toEqual(JSON.parse(JSON.stringify(patients)));
  expect(committed("meta").realProtocols).toBe(DEMO_POOL);
  expect(committed("meta").trials).toBe(DEMO_POOL + 1);
  expect(committed("meta").pairsEvaluated).toBe(patients.length * trials.length);
});

test("worklist pins the hero to the presentation pair", () => {
  const hero = committed("worklist").find((row: { patientId: string }) => row.patientId === PRESENTATION_PAIR.patientId);
  expect(hero).toMatchObject({ nctId: PRESENTATION_PAIR.nctId, unknownCount: 2, eliminated: false });
});

test("published cube is the worklist pairs plus every patient on the presentation trial", () => {
  const cube = committed("cube") as { patientId: string; nctId: string }[];
  const worklist = committed("worklist") as { patientId: string; nctId: string }[];
  const keys = new Set(cube.map((p) => `${p.patientId}|${p.nctId}`));
  for (const row of worklist) expect(keys.has(`${row.patientId}|${row.nctId}`)).toBe(true);
  expect(cube.filter((p) => p.nctId === PRESENTATION_TRIAL)).toHaveLength(patients.length);
  expect(cube.length).toBeLessThan(committed("meta").pairsEvaluated);
  expect(publishCube(cube as never, worklist as never, PRESENTATION_TRIAL)).toHaveLength(cube.length);
});

test("landscape.json is the compiler file when it has analytes, else derived from the same trials", () => {
  const compiled = loadLandscape(ROOT);
  expect(committed("landscape")).toEqual(compiled?.landscape ?? buildLandscape(trials));
});

test("payer.json is evaluate() over claims patients or the labelled stub", () => {
  const claims = loadClaims(ROOT);
  expect(committed("payer")).toEqual(
    JSON.parse(
      JSON.stringify(
        buildPayerView(
          claims?.patients ?? CLAIMS_STUB,
          loadPayerTrials(ROOT),
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

test("hcp.json groups every published patient and pins the hero on Rahman", () => {
  const panel = committed("hcp") as {
    channel: string;
    defaultPhysicianId: string;
    physicians: { id: string; patients: { patientId: string; trials: unknown[] }[] }[];
  };
  expect(panel.channel).toBe("Impiricus");
  const ids = panel.physicians.flatMap((p) => p.patients.map((row) => row.patientId));
  expect(new Set(ids).size).toBe(patients.length);
  expect(ids).toHaveLength(patients.length);
  const rahman = panel.physicians.find((p) => p.id === panel.defaultPhysicianId);
  expect(rahman?.patients.some((row) => row.patientId === PRESENTATION_PAIR.patientId)).toBe(true);
  expect(rahman?.patients.find((row) => row.patientId === PRESENTATION_PAIR.patientId)?.trials.length).toBeGreaterThan(0);
});

test("the engine's cube over the pinned presentation trial agrees with the hand-worked oracle", () => {
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
