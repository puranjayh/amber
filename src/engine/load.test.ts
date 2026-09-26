import { describe, expect, it } from "vitest";
import { loadPatients, loadTrials } from "./load";
import { leaf, patient, trial } from "./testing";

describe("loadTrials", () => {
  const good = trial({ nctId: "NCT00000001", criteria: [leaf({ id: "L" })] });

  it("reads a plain array of trials", () => {
    const out = loadTrials([good]);
    expect(out.records).toHaveLength(1);
    expect(out.envelope).toBe("array of records");
  });

  it("unwraps the compiler's { trial, reviewReasons, sourceText } envelope", () => {
    const out = loadTrials([
      { trial: good, reviewReasons: ["EXC-1 sourceSpan near-verbatim"], sourceText: "..." },
    ]);
    expect(out.records).toEqual([good]);
    expect(out.envelope).toMatch(/reviewReasons/);
  });

  it("reads an object with a .trials key", () => {
    expect(loadTrials({ trials: [good] }).envelope).toBe("object with .trials");
  });

  it("rejects a bad record and keeps the rest — one bad trial costs that trial", () => {
    const out = loadTrials([good, { nctId: "not-an-nct-id" }, good]);
    expect(out.records).toHaveLength(2);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0].index).toBe(1);
  });

  it("names the offender and the field, so a rejection is actionable", () => {
    const out = loadTrials([{ ...good, nctId: "NCT123" }]);
    expect(out.rejected[0].id).toBe("NCT123");
    expect(out.rejected[0].error).toMatch(/nctId/);
  });

  it("does not coerce a malformed record into a valid one — rule 5", () => {
    const out = loadTrials([{ ...good, compilerConfidence: 4 }]);
    expect(out.records).toHaveLength(0);
    expect(out.rejected).toHaveLength(1);
  });

  it("refuses an envelope it does not recognise, rather than guessing", () => {
    expect(() => loadTrials({ stuff: "here" })).toThrow(TypeError);
    expect(() => loadTrials("nope")).toThrow(/unrecognised envelope/);
  });

  it("is empty-input safe", () => {
    expect(loadTrials([]).records).toEqual([]);
  });

  it("keeps the compiler's defaults, so an omitted needsHumanReview means false", () => {
    const { needsHumanReview: _drop, ...withoutFlag } = good;
    expect(loadTrials([withoutFlag]).records[0].needsHumanReview).toBe(false);
  });
});

describe("loadPatients", () => {
  const p = patient({ id: "PT-1" });

  it("reads a plain array", () => {
    expect(loadPatients([p]).records).toHaveLength(1);
  });

  it("reads an object with a .patients key", () => {
    expect(loadPatients({ patients: [p] }).envelope).toBe("object with .patients");
  });

  it("rejects a patient with no id and reports the index", () => {
    const { id: _drop, ...noId } = p;
    const out = loadPatients([p, noId]);
    expect(out.records).toHaveLength(1);
    expect(out.rejected[0].index).toBe(1);
  });

  it("applies the contract's provenance default to a fact that omits it", () => {
    const withFact = {
      ...p,
      facts: [
        {
          predicate: "diagnosis",
          value: "NSCLC",
          observedAt: "2026-01-01",
          sourceQuote: "q",
          sourceDoc: "d",
        },
      ],
    };
    expect(loadPatients([withFact]).records[0].facts[0].provenance).toBe("chart");
  });
});
