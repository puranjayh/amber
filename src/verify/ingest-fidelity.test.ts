import { describe, expect, it } from "vitest";
import type { FidelityRow, FidelitySheet } from "./fidelity";
import { ingestFidelity, wilson95 } from "./ingest-fidelity";

const row = (over: Partial<FidelityRow> & Pick<FidelityRow, "id" | "stratum">): FidelityRow => ({
  nctId: "NCT00000001",
  trialTitle: "A trial",
  criterionIds: ["INC-1"],
  side: "inclusion",
  sourceSpans: ["A sentence."],
  sourceContext: "",
  compiledPlainEnglish: "Must: something",
  compiledOutline: ["- something"],
  treeHasDisjunction: false,
  sourceSuggestsDisjunction: false,
  detectorReasons: [],
  selection: over.stratum === "flagged" ? "most-suspicious-in-flagged-trial" : "uniform-random",
  faithful: null,
  failureMode: null,
  reviewer: null,
  ...over,
});

const sheetOf = (rows: FidelityRow[], over: Partial<FidelitySheet> = {}): FidelitySheet => ({
  seed: 1,
  corpus: { sha256: "abc", records: 300, trialsWithCriteria: 233 },
  strata: {
    flagged: { trials: 37, sampled: rows.filter((r) => r.stratum === "flagged").length, selection: "targeted" },
    unflagged: {
      trials: 196,
      criteriaAvailable: 2000,
      sampled: rows.filter((r) => r.stratum === "unflagged").length,
      samplingRate: 0.02,
    },
  },
  instructions: [],
  rowsWithoutSourceContext: 0,
  rows,
  ...over,
});

describe("wilson95", () => {
  it("never goes below zero, which the normal approximation does here", () => {
    // 0 of 40 is the case that matters: a normal interval would go negative.
    const i = wilson95(0, 40);
    expect(i.low).toBe(0);
    expect(i.high).toBeGreaterThan(0);
    expect(i.high).toBeLessThan(0.15);
  });

  it("never exceeds one", () => {
    const i = wilson95(40, 40);
    expect(i.high).toBe(1);
    expect(i.low).toBeGreaterThan(0.85);
  });

  it("brackets the point estimate", () => {
    const i = wilson95(4, 40);
    expect(i.low).toBeLessThan(0.1);
    expect(i.high).toBeGreaterThan(0.1);
  });

  it("narrows as the sample grows", () => {
    const small = wilson95(5, 50);
    const large = wilson95(50, 500);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it("is zero-width on no trials rather than dividing by zero", () => {
    expect(wilson95(0, 0)).toEqual({ low: 0, high: 0 });
  });
});

describe("ingestFidelity — the headline", () => {
  it("says the sentence we set out to be able to say", () => {
    const rows = [
      ...Array.from({ length: 37 }, (_, i) =>
        row({ id: `F-${i}`, stratum: "flagged", faithful: i < 30, failureMode: i < 30 ? null : "flattened-disjunction" }),
      ),
      ...Array.from({ length: 40 }, (_, i) =>
        row({ id: `U-${i}`, stratum: "unflagged", faithful: i < 38, failureMode: i < 38 ? null : "wrong-operator" }),
      ),
    ];
    const r = ingestFidelity(sheetOf(rows));
    expect(r.headline).toBe(
      "We hand-reviewed 77 compiled criteria against source protocol text; " +
        "compilation was faithful in 68, and our detector caught 7 of the 9 errors.",
    );
  });

  it("counts an undecided row out of every rate rather than as faithful", () => {
    const rows = [
      row({ id: "F-1", stratum: "flagged", faithful: false, failureMode: "x" }),
      row({ id: "U-1", stratum: "unflagged", faithful: true }),
      row({ id: "U-2", stratum: "unflagged", faithful: null }),
    ];
    const r = ingestFidelity(sheetOf(rows));
    expect(r.sample.judged).toBe(2);
    expect(r.sample.undecided).toBe(1);
    expect(r.sample.faithful).toBe(1);
    expect(r.unreviewedRowIds).toEqual(["U-2"]);
  });

  it("warns in the basis that the sample overstates detector recall", () => {
    const r = ingestFidelity(sheetOf([row({ id: "U-1", stratum: "unflagged", faithful: true })]));
    expect(r.headlineBasis).toMatch(/overstatement about the corpus/);
    expect(r.headlineBasis).toMatch(/oversampled by roughly 50x/);
  });
});

describe("ingestFidelity — per stratum", () => {
  const rows = [
    row({ id: "F-1", stratum: "flagged", faithful: false, failureMode: "flattened-disjunction" }),
    row({ id: "F-2", stratum: "flagged", faithful: false, failureMode: "Flattened-Disjunction" }),
    row({ id: "F-3", stratum: "flagged", faithful: true }),
    row({ id: "U-1", stratum: "unflagged", faithful: false, failureMode: "wrong-operator" }),
    row({ id: "U-2", stratum: "unflagged", faithful: true }),
    row({ id: "U-3", stratum: "unflagged", faithful: true }),
    row({ id: "U-4", stratum: "unflagged", faithful: true }),
  ];
  const r = ingestFidelity(sheetOf(rows));

  it("reports an error rate per stratum", () => {
    const flagged = r.sample.byStratum.find((s) => s.stratum === "flagged")!;
    const unflagged = r.sample.byStratum.find((s) => s.stratum === "unflagged")!;
    expect(flagged.errorRate).toBeCloseTo(2 / 3, 4);
    expect(unflagged.errorRate).toBeCloseTo(1 / 4, 4);
  });

  it("tallies failure modes case-insensitively, so two spellings are one mode", () => {
    const flagged = r.sample.byStratum.find((s) => s.stratum === "flagged")!;
    expect(flagged.failureModes).toEqual([{ mode: "flattened-disjunction", count: 2 }]);
  });

  it("labels an error with no stated mode rather than dropping it", () => {
    const r2 = ingestFidelity(sheetOf([row({ id: "F-1", stratum: "flagged", faithful: false })]));
    expect(r2.sample.byStratum[0].failureModes).toEqual([{ mode: "unspecified", count: 1 }]);
  });

  it("reports detector precision over the flagged rows it judged", () => {
    expect(r.sample.detectorPrecision).toBeCloseTo(2 / 3, 4);
  });

  it("splits caught from missed", () => {
    expect(r.sample.detectorCaught).toBe(2);
    expect(r.sample.detectorMissed).toBe(1);
    expect(r.sample.detectorRecallInSample).toBeCloseTo(2 / 3, 4);
  });
});

describe("ingestFidelity — the reweighted estimate", () => {
  const rows = [
    ...Array.from({ length: 37 }, (_, i) =>
      row({ id: `F-${i}`, stratum: "flagged", faithful: i >= 5, failureMode: i < 5 ? "flattened-disjunction" : null }),
    ),
    ...Array.from({ length: 40 }, (_, i) =>
      row({ id: `U-${i}`, stratum: "unflagged", faithful: i >= 2, failureMode: i < 2 ? "wrong-value" : null }),
    ),
  ];
  const r = ingestFidelity(sheetOf(rows));

  it("scales the unflagged error rate to the whole unflagged population", () => {
    // 2 of 40 is 5%; 5% of 2000 unflagged criteria is 100.
    expect(r.corpusEstimate.baseErrorRate).toBeCloseTo(0.05, 4);
    expect(r.corpusEstimate.estimatedUnfaithfulUnflagged).toBe(100);
  });

  it("does not scale the flagged stratum, which is a census of trials", () => {
    expect(r.corpusEstimate.observedUnfaithfulFlagged).toBe(5);
  });

  it("reports a far lower recall than the raw sample does", () => {
    // The number that keeps us honest: 5 of 105, not 5 of 7.
    expect(r.sample.detectorRecallInSample).toBeCloseTo(5 / 7, 3);
    expect(r.corpusEstimate.estimatedDetectorRecall).toBeCloseTo(5 / 105, 3);
  });

  it("puts an interval on the base rate, because it rests on 40 rows", () => {
    const i = r.corpusEstimate.baseErrorRate95;
    expect(i.low).toBeLessThan(0.05);
    expect(i.high).toBeGreaterThan(0.05);
    expect(i.high).toBeGreaterThan(i.low);
  });

  it("states the caveats rather than leaving them to be discovered", () => {
    const text = r.corpusEstimate.caveats.join(" ");
    expect(text).toMatch(/upper bound/);
    expect(text).toMatch(/Quote the interval/);
    expect(text).toMatch(/one corpus sha/);
  });
});

describe("ingestFidelity — edges", () => {
  it("is safe on an untouched sheet", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ id: `U-${i}`, stratum: "unflagged" }));
    const r = ingestFidelity(sheetOf(rows));
    expect(r.sample.judged).toBe(0);
    expect(r.sample.detectorRecallInSample).toBe(0);
    expect(r.corpusEstimate.baseErrorRate).toBe(0);
    expect(r.unreviewedRowIds).toHaveLength(5);
    expect(Number.isFinite(r.corpusEstimate.estimatedDetectorRecall)).toBe(true);
  });

  it("is safe on an empty sheet", () => {
    const r = ingestFidelity(sheetOf([]));
    expect(r.headline).toMatch(/reviewed 0 compiled criteria/);
  });

  it("reports a perfect result without claiming a recall it cannot compute", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ id: `U-${i}`, stratum: "unflagged", faithful: true }),
    );
    const r = ingestFidelity(sheetOf(rows));
    expect(r.sample.unfaithful).toBe(0);
    expect(r.sample.detectorRecallInSample).toBe(0);
    expect(r.headline).toMatch(/caught 0 of the 0 errors/);
  });
});
