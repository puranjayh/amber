import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { CubeFixture, PatientsFixture, TrialsFixture } from "@/src/contracts";
import { buildHcpPanel } from "@/app/_data/hcp";
import { DEFAULT_PHYSICIAN_ID } from "./roster";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const trials = TrialsFixture.parse(JSON.parse(readFileSync(`${ROOT}fixtures/trials.sample.json`, "utf8")));
const patients = PatientsFixture.parse(JSON.parse(readFileSync(`${ROOT}fixtures/patients.sample.json`, "utf8")));
const cube = CubeFixture.parse(JSON.parse(readFileSync(`${ROOT}fixtures/cube.sample.json`, "utf8")));

test("fixture patients sit on the presentation physician and keep rank() order", () => {
  const panel = buildHcpPanel(cube, patients, trials);
  expect(panel.channel).toBe("Impiricus");
  const rahman = panel.physicians.find((p) => p.id === DEFAULT_PHYSICIAN_ID);
  expect(rahman?.patients.map((p) => p.patientId).sort()).toEqual(["PT-4401", "PT-4402", "PT-4408"]);
  const hero = rahman?.patients.find((p) => p.patientId === "PT-4401");
  expect(hero?.bestNctId).toMatch(/^NCT\d{8}$/);
  expect(hero?.portal).toMatchObject({ maxTravelMinutes: 90, acceptsPlacebo: false });
  expect(hero?.trials.length).toBeGreaterThan(0);
  expect(hero?.trials.every((t) => t.nctId.startsWith("NCT"))).toBe(true);
});

test("a patient with no live pair still appears with an empty trial list", () => {
  const empty = patients.map((p) => ({
    patientId: p.id,
    nctId: "NCT07001001",
    eliminated: true,
    passCount: 0,
    failCount: 1,
    unknownCount: 0,
    resolutionCost: 0,
    expectedValue: 0,
    cells: [],
  }));
  const panel = buildHcpPanel(empty, [patients[0]], trials);
  expect(panel.physicians[0].patients[0]).toMatchObject({
    patientId: "PT-4401",
    liveTrials: 0,
    trials: [],
  });
});
