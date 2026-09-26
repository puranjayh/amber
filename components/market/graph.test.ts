import { describe, expect, test } from "vitest";
import cubeJson from "@/fixtures/cube.sample.json";
import trialsJson from "@/fixtures/trials.sample.json";
import sample from "@/app/_data/assignments.json";
import { Assignment, CubeFixture, TrialsFixture } from "@/src/contracts";
import { buildGraph, edgeKey } from "./graph";

const cube = CubeFixture.parse(cubeJson);
const trials = TrialsFixture.parse(trialsJson);
const assignments = Assignment.array().parse(sample);
const patientIds = ["PT-4401", "PT-4402", "PT-4408"];

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

  test("nodes sit in two columns within the viewBox", () => {
    for (const n of [...graph.patients, ...graph.trials]) {
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(graph.height);
    }
    expect(graph.patients[0].x).toBeLessThan(graph.trials[0].x);
  });
});
