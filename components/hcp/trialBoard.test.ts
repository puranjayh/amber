import { expect, test } from "vitest";
import type { CriterionLeaf, PairResult, Trial } from "@/src/contracts";
import type { RegistryStudy } from "@/app/_data/schema";
import { blockerSentence, buildTrialCards, phaseWords, trialTopics } from "./trialBoard";

function leaf(partial: Partial<CriterionLeaf> & Pick<CriterionLeaf, "id" | "predicate">): CriterionLeaf {
  return {
    kind: "leaf",
    type: "inclusion",
    operator: ">=",
    value: 1,
    tier: 1,
    sourceSpan: partial.id,
    ...partial,
  };
}

function pair(nctId: string, patientId: string, unknownCount: number, eliminated = false): PairResult {
  return {
    patientId,
    nctId,
    eliminated,
    passCount: 1,
    failCount: 0,
    unknownCount,
    resolutionCost: 1,
    expectedValue: 1,
    cells: [],
  };
}

const trial = (nctId: string, title: string): Trial =>
  ({
    nctId,
    title,
    phase: "PHASE2",
    condition: "NSCLC",
    slots: 0,
    criteria: [],
    compilerConfidence: 1,
    needsHumanReview: false,
  }) as Trial;

test("trials rank by patients close to eligible, not by how many the trial wants", () => {
  const big = "NCT00000002";
  const small = "NCT00000001";
  const studies = new Map<string, RegistryStudy>([
    [
      big,
      {
        nctId: big,
        overallStatus: "RECRUITING",
        lastUpdatePostDate: null,
        primaryCompletionDate: null,
        enrollmentCount: 500,
        sites: [],
      },
    ],
    [
      small,
      {
        nctId: small,
        overallStatus: "RECRUITING",
        lastUpdatePostDate: null,
        primaryCompletionDate: null,
        enrollmentCount: 10,
        sites: [],
      },
    ],
  ]);
  const cards = buildTrialCards({
    pairs: [
      pair(big, "A", 4),
      pair(small, "A", 0),
      pair(small, "B", 1),
      pair(small, "C", 1),
    ],
    trials: new Map([
      [big, trial(big, "Large study")],
      [small, trial(small, "Small study")],
    ]),
    studies,
  });
  expect(cards.map((card) => card.nctId)).toEqual([small, big]);
  expect(cards[0].close).toBe(3);
  expect(cards[0].enrollment).toBe(10);
  expect(cards[1].enrollment).toBe(500);
  expect(cards[0].statusLine).toBe("RECRUITING — open to new patients");
  expect(cards[0].topics).toEqual(["Non-small cell lung cancer"]);
});

test("non-small cell is not also small cell", () => {
  expect(trialTopics("Non-small cell lung cancer; Breast cancer")).toEqual([
    "Non-small cell lung cancer",
    "Breast cancer",
  ]);
  expect(trialTopics("Limited Stage Small Cell Lung Cancer")).toEqual(["Small cell lung cancer"]);
});

test("a shared lab is one order covering those patients", () => {
  const anc = leaf({
    id: "INC-10",
    predicate: "lab_value",
    analyte: "Absolute neutrophil count",
    sourceSpan: "Absolute neutrophil count >= 1,500/mcL",
  });
  expect(blockerSentence(11, anc)).toBe("11 of your patients need the same test — CBC with differential.");
});

test("a shared chart gap is a review, not a test", () => {
  const diagnosis = leaf({
    id: "INC-1",
    predicate: "diagnosis",
    sourceSpan: "Histologically confirmed non-small cell lung cancer",
  });
  expect(blockerSentence(20, diagnosis)).toBe(
    "20 of your patients need the same chart review — Confirm diagnosis in the chart.",
  );
  expect(blockerSentence(20, diagnosis)).not.toMatch(/need the same test/);
});

test("a shared washout is not described as a test", () => {
  const wash = leaf({
    id: "EXC-1",
    predicate: "washout",
    type: "exclusion",
    tier: 4,
    sourceSpan: "Major surgery within 21 days",
  });
  expect(blockerSentence(11, wash)).toMatch(/waiting out the same washout/);
  expect(blockerSentence(11, wash)).not.toMatch(/need the same test/);
});

test("phase reads as a clinician would say it", () => {
  expect(phaseWords("PHASE1")).toBe("Phase 1");
});
