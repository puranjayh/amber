import { describe, expect, it } from "vitest";
import { actionableEntries, calendar, timeBoundCrossings } from "./calendar";
import { evaluate } from "./evaluate";
import { addDays } from "./time";
import { fact, group, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

/** "No systemic therapy within 21 days" — the classic tier-4 gate. */
const washout21 = leaf({
  id: "EXC-washout",
  type: "exclusion",
  predicate: "washout",
  operator: "<",
  value: 21,
  unit: "days",
  tier: 4,
  sourceSpan: "Systemic anticancer therapy within 21 days before the first dose",
});

/** The same gate written as an inclusion requirement instead. */
const cleared21 = leaf({
  id: "INC-washout",
  predicate: "washout",
  operator: ">=",
  value: 21,
  unit: "days",
  tier: 4,
  sourceSpan: "At least 21 days since the last dose of systemic therapy",
});

const lastDose = (id: string, date: string, extra: ReturnType<typeof fact>[] = []) =>
  patient({
    id,
    age: 60,
    facts: [
      fact({
        predicate: "washout",
        value: date,
        observedAt: date,
        sourceQuote: `last dose of pemetrexed ${date}`,
      }),
      ...extra,
    ],
  });

describe("timeBoundCrossings", () => {
  const t = trial({ nctId: "NCT00000001", criteria: [washout21] });

  it("offers both sides of the threshold and nothing else", () => {
    // Last dose 2026-09-20 + 21 and + 22 days.
    expect(timeBoundCrossings(t, lastDose("PT-1", "2026-09-20"), ASOF)).toEqual([
      "2026-10-11",
      "2026-10-12",
    ]);
  });

  it("offers nothing for a criterion that is not time-bound", () => {
    const anc = leaf({ id: "INC-anc", analyte: "ANC", operator: ">=", value: 1500, tier: 1 });
    const notTier4 = trial({ nctId: "NCT00000002", criteria: [anc] });
    expect(timeBoundCrossings(notTier4, lastDose("PT-1", "2026-09-20"), ASOF)).toEqual([]);
  });

  it("offers nothing when the washout fact holds a day count rather than a date", () => {
    // An elapsed-days snapshot says nothing about when it reaches the threshold.
    const p = patient({ id: "PT-1", age: 60, facts: [fact({ predicate: "washout", value: 5 })] });
    expect(timeBoundCrossings(t, p, ASOF)).toEqual([]);
  });

  it("drops dates already in the past", () => {
    expect(timeBoundCrossings(t, lastDose("PT-1", "2025-01-01"), ASOF)).toEqual([]);
  });

  it("respects the horizon", () => {
    const farOff = lastDose("PT-1", "2026-09-20");
    expect(timeBoundCrossings(t, farOff, ASOF, 10)).toEqual([]);
    expect(timeBoundCrossings(t, farOff, ASOF, 20)).toEqual(["2026-10-11", "2026-10-12"]);
  });

  it("crosses a month boundary exactly", () => {
    expect(addDays("2026-09-20", 21)).toBe("2026-10-11");
    expect(addDays("2026-12-20", 21)).toBe("2027-01-10");
    expect(addDays("2024-02-20", 21)).toBe("2024-03-12"); // leap year
  });

  it("rejects an unusable asOf rather than projecting from nonsense", () => {
    expect(() => timeBoundCrossings(t, lastDose("PT-1", "2026-09-20"), "soon")).toThrow(TypeError);
  });
});

describe("calendar", () => {
  it("dates the day an exclusion washout stops firing", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [washout21] });
    const p = lastDose("PT-1", "2026-09-20");
    // Blocked today.
    expect(evaluate(p, t, ASOF).eliminated).toBe(true);

    const entries = calendar([p], [t], ASOF);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      patientId: "PT-1",
      nctId: "NCT00000001",
      becomesEligibleOn: "2026-10-11",
      daysFromAsOf: 16,
      gatingCriterionIds: ["EXC-washout"],
    });
  });

  it("dates an inclusion washout the same way", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [cleared21] });
    const entries = calendar([lastDose("PT-1", "2026-09-20")], [t], ASOF);
    expect(entries[0].becomesEligibleOn).toBe("2026-10-11");
  });

  it("really is eligible on that date, and really is not the day before", () => {
    // The assertion that matters: the date is checked by the engine itself.
    const t = trial({ nctId: "NCT00000001", criteria: [washout21] });
    const p = lastDose("PT-1", "2026-09-20");
    const when = calendar([p], [t], ASOF)[0].becomesEligibleOn;
    expect(evaluate(p, t, when).eliminated).toBe(false);
    expect(evaluate(p, t, addDays(when, -1)!).eliminated).toBe(true);
  });

  it("carries the trial's own words for what is being waited on", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [washout21] });
    expect(calendar([lastDose("PT-1", "2026-09-20")], [t], ASOF)[0].gatingCitations).toEqual([
      "Systemic anticancer therapy within 21 days before the first dose",
    ]);
  });

  it("leaves out a patient who is already eligible today", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [washout21] });
    expect(calendar([lastDose("PT-1", "2026-01-01")], [t], ASOF)).toEqual([]);
  });

  it("leaves out a patient blocked by something waiting cannot fix", () => {
    const t = trial({
      nctId: "NCT00000001",
      criteria: [washout21, leaf({ id: "INC-0", predicate: "age", operator: ">=", value: 18 })],
    });
    const child = { ...lastDose("PT-KID", "2026-09-20"), age: 9 };
    expect(calendar([child], [t], ASOF)).toEqual([]);
  });

  it("waits for the later of two washouts, not the earlier", () => {
    const second = {
      ...washout21,
      id: "EXC-washout-b",
      value: 42,
      sourceSpan: "Radiotherapy within 42 days before the first dose",
    };
    const t = trial({ nctId: "NCT00000001", criteria: [washout21, second] });
    const p = lastDose("PT-1", "2026-09-20");
    const entry = calendar([p], [t], ASOF)[0];
    expect(entry.becomesEligibleOn).toBe("2026-11-01"); // 2026-09-20 + 42
    expect(evaluate(p, t, entry.becomesEligibleOn).eliminated).toBe(false);
  });

  it("takes the earlier branch of an OR of washouts", () => {
    const longer = { ...washout21, id: "EXC-washout-b", value: 42 };
    const either = group("OR", [washout21, longer], "Either washout period");
    const t = trial({ nctId: "NCT00000001", criteria: [either] });
    // The OR fires while either arm fires, so it clears when both have — but
    // with an OR of exclusions the group stops firing only once neither does.
    const entry = calendar([lastDose("PT-1", "2026-09-20")], [t], ASOF)[0];
    expect(entry.becomesEligibleOn).toBe("2026-11-01");
  });

  it("reports unknowns still open on that date", () => {
    const egfr = leaf({
      id: "INC-egfr",
      predicate: "biomarker",
      analyte: "EGFR",
      operator: "==",
      value: "L858R",
      tier: 0,
    });
    const t = trial({ nctId: "NCT00000001", criteria: [washout21, egfr] });
    expect(calendar([lastDose("PT-1", "2026-09-20")], [t], ASOF)[0].unknownCountOnDate).toBe(1);
  });

  it("lists labs that are fresh today but will have aged out by then", () => {
    const anc = leaf({
      id: "INC-anc",
      predicate: "lab_value",
      analyte: "ANC",
      operator: ">=",
      value: 1500,
      unit: "/uL",
      maxAgeDays: 14,
      tier: 1,
      sourceSpan: "ANC >= 1500/uL within 14 days",
    });
    const t = trial({ nctId: "NCT00000001", criteria: [washout21, anc] });
    const p = lastDose("PT-1", "2026-09-20", [
      fact({
        predicate: "lab_value",
        analyte: "ANC",
        value: 3000,
        unit: "/uL",
        observedAt: "2026-09-24",
        sourceQuote: "ANC 3000/uL",
      }),
    ]);
    const entry = calendar([p], [t], ASOF)[0];
    expect(entry.becomesEligibleOn).toBe("2026-10-11");
    expect(entry.newlyStaleCriterionIds).toEqual(["INC-anc"]);
    expect(entry.unknownCountOnDate).toBe(1);
  });

  it("refuses to call decay an eligibility date", () => {
    // The exclusion fires today on a fact with a 30-day window and no washout in
    // sight. In 31 days it stops firing — because we lost the evidence, not
    // because anything was waited out. That must never reach a calendar.
    const decaying = leaf({
      id: "EXC-ild",
      type: "exclusion",
      predicate: "comorbidity",
      operator: "==",
      value: "interstitial lung disease",
      maxAgeDays: 30,
      tier: 2,
      sourceSpan: "History of interstitial lung disease",
    });
    const t = trial({ nctId: "NCT00000001", criteria: [washout21, decaying] });
    const p = lastDose("PT-1", "2026-09-20", [
      fact({
        predicate: "comorbidity",
        value: "interstitial lung disease",
        observedAt: "2026-09-24",
        sourceQuote: "CT shows established ILD",
      }),
    ]);
    // Eliminated today on both counts. The washout clears on 10-11, but the ILD
    // exclusion still fires then, so there is no honest date inside the horizon.
    expect(evaluate(p, t, ASOF).eliminated).toBe(true);
    expect(calendar([p], [t], ASOF)).toEqual([]);
  });

  it("still dates a patient whose unrelated labs happen to decay by then", () => {
    // The mirror of the test above: decay is present but is not what unblocked
    // them, so the entry stands.
    const anc = leaf({
      id: "INC-anc",
      predicate: "lab_value",
      analyte: "ANC",
      operator: ">=",
      value: 1500,
      unit: "/uL",
      maxAgeDays: 7,
      tier: 1,
    });
    const t = trial({ nctId: "NCT00000001", criteria: [washout21, anc] });
    const p = lastDose("PT-1", "2026-09-20", [
      fact({
        predicate: "lab_value",
        analyte: "ANC",
        value: 3000,
        unit: "/uL",
        observedAt: "2026-09-24",
        sourceQuote: "ANC 3000/uL",
      }),
    ]);
    expect(calendar([p], [t], ASOF)[0].becomesEligibleOn).toBe("2026-10-11");
  });

  it("respects the horizon and says nothing beyond it", () => {
    const long = { ...washout21, value: 400 };
    const t = trial({ nctId: "NCT00000001", criteria: [long] });
    expect(calendar([lastDose("PT-1", "2026-09-20")], [t], ASOF)).toEqual([]);
    expect(calendar([lastDose("PT-1", "2026-09-20")], [t], ASOF, { horizonDays: 500 })).toHaveLength(1);
  });
});

describe("trials that close first", () => {
  const t = trial({ nctId: "NCT00000001", criteria: [washout21] });
  const p = lastDose("PT-1", "2026-09-20"); // eligible 2026-10-11

  it("flags a trial that stops enrolling before the patient can join", () => {
    const entries = calendar([p], [t], ASOF, { closesOn: { NCT00000001: "2026-10-01" } });
    expect(entries[0]).toMatchObject({
      trialClosesOn: "2026-10-01",
      closesBeforeEligible: true,
    });
  });

  it("does not flag a trial that is still open on the day", () => {
    const entries = calendar([p], [t], ASOF, { closesOn: { NCT00000001: "2026-12-01" } });
    expect(entries[0].closesBeforeEligible).toBe(false);
  });

  it("treats closing exactly on the day as still open", () => {
    const entries = calendar([p], [t], ASOF, { closesOn: { NCT00000001: "2026-10-11" } });
    expect(entries[0].closesBeforeEligible).toBe(false);
  });

  it("makes no claim at all when no close date was supplied", () => {
    const entries = calendar([p], [t], ASOF);
    expect(entries[0].trialClosesOn).toBeUndefined();
    expect(entries[0].closesBeforeEligible).toBe(false);
  });

  it("separates the actionable entries from the ones that are a silent no", () => {
    const other = trial({ nctId: "NCT00000002", criteria: [washout21] });
    const entries = calendar([p], [t, other], ASOF, {
      closesOn: { NCT00000001: "2026-10-01", NCT00000002: "2027-01-01" },
    });
    expect(entries).toHaveLength(2);
    expect(actionableEntries(entries).map((e) => e.nctId)).toEqual(["NCT00000002"]);
  });
});

describe("calendar shape and purity", () => {
  const washoutB = { ...washout21, id: "EXC-washout", value: 30 };
  const tA = trial({ nctId: "NCT00000002", criteria: [washout21] });
  const tB = trial({ nctId: "NCT00000001", criteria: [washoutB] });
  const ps = [lastDose("PT-2", "2026-09-20"), lastDose("PT-1", "2026-09-20")];

  it("sorts by date, then trial, then patient", () => {
    const entries = calendar(ps, [tA, tB], ASOF);
    expect(entries.map((e) => `${e.becomesEligibleOn}/${e.nctId}/${e.patientId}`)).toEqual([
      "2026-10-11/NCT00000002/PT-1",
      "2026-10-11/NCT00000002/PT-2",
      "2026-10-20/NCT00000001/PT-1",
      "2026-10-20/NCT00000001/PT-2",
    ]);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const before = JSON.stringify([ps, [tA, tB]]);
    expect(calendar(ps, [tA, tB], ASOF)).toEqual(calendar(ps, [tA, tB], ASOF));
    expect(JSON.stringify([ps, [tA, tB]])).toBe(before);
  });

  it("is empty-input safe", () => {
    expect(calendar([], [], ASOF)).toEqual([]);
    expect(calendar(ps, [], ASOF)).toEqual([]);
  });

  it("emits at most one date per patient-trial pair", () => {
    const entries = calendar(ps, [tA, tB], ASOF);
    const keys = entries.map((e) => `${e.patientId}|${e.nctId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never dates anything on or before asOf", () => {
    for (const e of calendar(ps, [tA, tB], ASOF)) {
      expect(e.becomesEligibleOn > ASOF).toBe(true);
      expect(e.daysFromAsOf).toBeGreaterThan(0);
    }
  });
});
