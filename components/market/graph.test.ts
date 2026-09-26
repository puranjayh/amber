import { describe, expect, test } from "vitest";
import cubeJson from "@/fixtures/cube.sample.json";
import trialsJson from "@/fixtures/trials.sample.json";
import sample from "@/app/_data/assignments.json";
import { Assignment, CubeFixture, TrialsFixture } from "@/src/contracts";
import { buildGraph, edgeKey, graphTrials } from "./graph";

const cube = CubeFixture.parse(cubeJson);
const trials = TrialsFixture.parse(trialsJson);
const patientIds = ["PT-4401", "PT-4402", "PT-4408"];
const assignments = Assignment.array()
  .parse(sample)
  .map((a) => ({ ...a, pairs: a.pairs.filter((p) => patientIds.includes(p.patientId)) }));

describe("buildGraph", () => {
  const graph = buildGraph(patientIds, trials, cube, assignments);

  test("candidate edges are exactly the non-eliminated pairs in the cube", () => {
    expect(graph.candidates.map((e) => e.key).sort()).toEqual(
      cube.filter((p) => !p.eliminated).map((p) => edgeKey(p.patientId, p.nctId)).sort(),
    );
  });

  test("an edge with open unknowns is marked unknown, a resolved one eligible", () => {
    const status = Object.fromEntries(graph.candidates.map((e) => [e.key, e.status]));
    expect(status[edgeKey("PT-4402", "NCT07001003")]).toBe("eligible");
    expect(status[edgeKey("PT-4401", "NCT07001001")]).toBe("unknown");
  });

  test("every mode is precomputed, and the engine assigns only candidate pairs", () => {
    for (const mode of ["adhoc", "stable", "stable_dap"] as const) {
      expect(graph.modes[mode]).toBeDefined();
      expect(graph.modes[mode]!.invalid).toEqual([]);
    }
    expect(graph.modes.stable!.load["NCT07001001"]).toBe(2);
  });

  test("an assignment to an eliminated pair is flagged, not drawn as a match", () => {
    const bad = buildGraph(patientIds, trials, cube, [
      { ...assignments[0], pairs: [{ patientId: "PT-4402", nctId: "NCT07001001" }] },
    ]);
    expect(bad.modes.adhoc!.assigned).toEqual([]);
    expect(bad.modes.adhoc!.invalid).toEqual([{ patientId: "PT-4402", nctId: "NCT07001001" }]);
  });

  test("cube and assignment pairs outside the shown patients are not drawn", () => {
    const extra = {
      ...cube[0],
      patientId: "PT-OUTSIDE",
      nctId: "NCT07001001",
      eliminated: false,
    };
    const graph = buildGraph(
      patientIds,
      trials,
      [...cube, extra],
      assignments.map((a) => ({
        ...a,
        pairs: [...a.pairs, { patientId: "PT-OUTSIDE", nctId: "NCT07001001" }],
      })),
    );
    expect(graph.candidates.some((e) => e.patientId === "PT-OUTSIDE")).toBe(false);
    expect(graph.patients.map((n) => n.id)).toEqual(patientIds);
    for (const mode of Object.values(graph.modes)) {
      expect(mode.assigned.every((k) => !k.startsWith("PT-OUTSIDE"))).toBe(true);
      expect(mode.invalid.every((p) => p.patientId !== "PT-OUTSIDE")).toBe(true);
    }
  });

  test("nodes sit in two columns within the viewBox", () => {
    for (const n of [...graph.patients, ...graph.trials]) {
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(graph.height);
    }
    expect(graph.patients[0].x).toBeLessThan(graph.trials[0].x);
  });
});

test("graphTrials keeps the pin and assignment targets, not the whole pool", () => {
  const pool = [...trials.map((t) => ({ nctId: t.nctId, slots: t.slots })), { nctId: "NCT09999999", slots: 1 }];
  const shown = graphTrials(patientIds, pool, assignments, [{ patientId: "PT-4401", nctId: "NCT07001001" }], "NCT07001001");
  expect(shown.map((t) => t.nctId)).toContain("NCT07001001");
  expect(shown.map((t) => t.nctId)).not.toContain("NCT09999999");
});
