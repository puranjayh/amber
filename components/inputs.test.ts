import { expect, test } from "vitest";
import { acceptPatients, acceptTrials, unwrapTrials } from "@/app/_data/inputs";

test("unwrapTrials accepts a bare Trial[] and the compiler { trial } wrapper", () => {
  const bare = { nctId: "NCT00000001", title: "t", phase: "PHASE2", condition: "NSCLC", slots: 1, criteria: [{ kind: "leaf", id: "INC-1", type: "inclusion", predicate: "age", operator: ">=", value: 18, tier: 0, sourceSpan: "Age ≥ 18." }], compilerConfidence: 1, needsHumanReview: false };
  expect(unwrapTrials([bare])).toEqual([bare]);
  expect(unwrapTrials([{ trial: bare, sourceText: "…", failure: null }])).toEqual([bare]);
});

test("acceptTrials drops needsHumanReview and empty criteria", () => {
  const ok = {
    nctId: "NCT00000001",
    title: "t",
    phase: "PHASE2",
    condition: "NSCLC",
    slots: 1,
    criteria: [{ kind: "leaf", id: "INC-1", type: "inclusion", predicate: "age", operator: ">=", value: 18, tier: 0, sourceSpan: "Age ≥ 18." }],
    compilerConfidence: 1,
    needsHumanReview: false,
  };
  const flagged = { ...ok, nctId: "NCT00000002", needsHumanReview: true };
  const empty = { ...ok, nctId: "NCT00000003", criteria: [] };
  expect(acceptTrials([ok, flagged, empty]).map((t) => t.nctId)).toEqual(["NCT00000001"]);
});

test("acceptPatients keeps a valid record and skips a broken one", () => {
  const ok = {
    id: "SYN-1",
    age: 60,
    sex: "F",
    race: "white",
    facts: [
      {
        predicate: "age",
        value: 60,
        observedAt: "2026-01-01",
        sourceQuote: "age 60",
        sourceDoc: "row",
        provenance: "chart",
      },
    ],
  };
  const kept = acceptPatients([ok, { id: "nope" }], "test.json");
  expect(kept.map((p) => p.id)).toEqual(["SYN-1"]);
});
