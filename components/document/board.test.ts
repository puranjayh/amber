import { expect, test } from "vitest";
import type { CriterionLeaf, CubeCell, PairResult, Patient, Trial } from "@/src/contracts";
import { boardEntries, focusOrder, trialBlocks, unknownLabel } from "./board";

function leaf(
  id: string,
  type: "inclusion" | "exclusion",
  predicate: CriterionLeaf["predicate"] = "age",
): CriterionLeaf {
  return {
    kind: "leaf",
    id,
    type,
    predicate,
    operator: ">=",
    value: 18,
    tier: 1,
    sweepable: false,
    sourceSpan: `${id} text`,
  };
}

function cell(
  nctId: string,
  criterionId: string,
  verdict: CubeCell["verdict"],
  reason: CubeCell["reason"],
): CubeCell {
  return {
    patientId: "PT-1",
    nctId,
    criterionId,
    verdict,
    reason,
    criterionCitation: `${criterionId} text`,
    tier: 1,
  };
}

function trial(nctId: string, title: string, criteria: CriterionLeaf[]): Trial {
  return {
    nctId,
    title,
    phase: "PHASE3",
    condition: "NSCLC",
    slots: 4,
    criteria,
    compilerConfidence: 1,
    needsHumanReview: false,
  };
}

function pair(
  nctId: string,
  over: Partial<PairResult> & Pick<PairResult, "cells" | "eliminated" | "unknownCount">,
): PairResult {
  return {
    patientId: "PT-1",
    nctId,
    passCount: 0,
    failCount: 0,
    resolutionCost: 0,
    expectedValue: 0,
    ...over,
  };
}

const patient: Patient = {
  id: "PT-1",
  age: 64,
  sex: "F",
  race: "White",
  facts: [],
};

test("easiest open trials lead, and ruled out trials go last", () => {
  const specs = [
    { nctId: "NCT00000003", title: "Ruled out", eliminated: true, unknownCount: 0, expectedValue: 9 },
    { nctId: "NCT00000002", title: "Many open", eliminated: false, unknownCount: 4, expectedValue: 9 },
    { nctId: "NCT00000001", title: "One open", eliminated: false, unknownCount: 1, expectedValue: 1 },
    { nctId: "NCT00000004", title: "Close and worth more", eliminated: false, unknownCount: 2, expectedValue: 3 },
  ];
  const trials = new Map(
    specs.map((row) => [row.nctId, trial(row.nctId, row.title, [leaf("INC-1", "inclusion")])]),
  );
  const ranked = boardEntries(
    specs.map((row) =>
      pair(row.nctId, {
        eliminated: row.eliminated,
        unknownCount: row.unknownCount,
        expectedValue: row.expectedValue,
        cells: [cell(row.nctId, "INC-1", "UNKNOWN", "absent")],
      }),
    ),
    (id) => trials.get(id),
  );
  expect(ranked.map((row) => row.nctId)).toEqual(["NCT00000001", "NCT00000004", "NCT00000002", "NCT00000003"]);
  expect(ranked[0]?.title).toBe("One open");
});

test("a chart with only fails still lists those trials", () => {
  const nctId = "NCT00000009";
  const ranked = boardEntries(
    [
      pair(nctId, {
        eliminated: true,
        unknownCount: 0,
        cells: [cell(nctId, "INC-1", "FAIL", "contradicted")],
      }),
    ],
    () => trial(nctId, "Only fail", [leaf("INC-1", "inclusion")]),
  );
  expect(ranked.map((row) => row.nctId)).toEqual([nctId]);
  expect(ranked[0]?.eliminated).toBe(true);
});

test("met counts a cleared exclusion, not a raw pass", () => {
  const criteria = [
    leaf("INC-1", "inclusion"),
    leaf("EXC-1", "exclusion"),
    leaf("INC-2", "inclusion"),
  ];
  const nctId = "NCT00000011";
  const ranked = boardEntries(
    [
      pair(nctId, {
        eliminated: false,
        unknownCount: 1,
        cells: [
          cell(nctId, "INC-1", "PASS", "satisfied"),
          cell(nctId, "EXC-1", "FAIL", "contradicted"),
          cell(nctId, "INC-2", "UNKNOWN", "absent"),
        ],
      }),
    ],
    () => trial(nctId, "Met trial", criteria),
  );
  expect(ranked[0]).toMatchObject({ met: 2, total: 3, unknownCount: 1 });
});

test("unknown label stays a count", () => {
  expect(unknownLabel(0)).toBe("0 unknowns");
  expect(unknownLabel(1)).toBe("1 unknown");
  expect(unknownLabel(2)).toBe("2 unknowns");
});

test("an open criterion names the block and the order that would resolve it", () => {
  const criteria = [leaf("INC-1", "inclusion", "age")];
  const nctId = "NCT00000021";
  const row = pair(nctId, {
    eliminated: false,
    unknownCount: 1,
    cells: [cell(nctId, "INC-1", "UNKNOWN", "absent")],
  });
  const blocks = trialBlocks(patient, trial(nctId, "Age trial", criteria), row);
  expect(blocks).toEqual([
    {
      criterionId: "INC-1",
      blocking: "Age not confirmed",
      resolve: "Order: Confirm date of birth in the record",
    },
  ]);
  expect(focusOrder(patient, trial(nctId, "Age trial", criteria), row)?.title).toBe(
    "Confirm date of birth in the record",
  );
});

test("a fail is a block with nothing to order", () => {
  const criteria = [leaf("INC-1", "inclusion", "age")];
  const nctId = "NCT00000022";
  const blocks = trialBlocks(
    patient,
    trial(nctId, "Out", criteria),
    pair(nctId, {
      eliminated: true,
      unknownCount: 0,
      cells: [cell(nctId, "INC-1", "FAIL", "contradicted")],
    }),
  );
  expect(blocks).toEqual([
    {
      criterionId: "INC-1",
      blocking: "Age is outside the range this trial requires",
      resolve: "Nothing to order.",
    },
  ]);
});
