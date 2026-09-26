import { describe, expect, it } from "vitest";
import { EquityRow as EquityRowSchema } from "@/src/contracts";
import { equityAudit, equityAuditAcross } from "./equity";
import { assertValidLeaf } from "./testing";
import { fact, leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

const BLACK = "Black or African American";
const WHITE = "White";

/**
 * A neutrophil floor. The real-world finding this exhibit exists for: benign
 * ethnic neutropenia means a 1500/uL ANC floor excludes a materially larger
 * share of Black patients who are otherwise perfectly good candidates.
 */
const ancFloor = leaf({
  id: "INC-anc",
  predicate: "lab_value",
  analyte: "ANC",
  operator: ">=",
  value: 1500,
  unit: "/uL",
  maxAgeDays: 28,
  tier: 1,
  sourceSpan: "Absolute neutrophil count >= 1500/uL",
});

const stageOk = leaf({
  id: "INC-stage",
  predicate: "staging",
  operator: "in",
  value: ["IIIA", "IIIB"],
  tier: 2,
  sourceSpan: "Stage IIIA or IIIB disease",
});

const subject = (
  id: string,
  race: string,
  anc: number | null,
  stage: string | null = "IIIA",
) =>
  patient({
    id,
    age: 60,
    race,
    facts: [
      ...(anc === null
        ? []
        : [
            fact({
              predicate: "lab_value",
              analyte: "ANC",
              value: anc,
              unit: "/uL",
              observedAt: "2026-09-20",
              sourceQuote: `ANC ${anc}/uL`,
            }),
          ]),
      ...(stage === null
        ? []
        : [fact({ predicate: "staging", value: stage, sourceQuote: `Stage ${stage}` })]),
    ],
  });

const rowFor = (rows: readonly ReturnType<typeof equityAudit>[number][], id: string) => {
  const r = rows.find((x) => x.criterionId === id);
  if (!r) throw new Error(`no row for ${id}`);
  return r;
};

describe("equityAudit", () => {
  const t = trial({ nctId: "NCT00000001", criteria: [ancFloor, stageOk] });

  // Four of each group. Three of four Black patients fall below the floor,
  // one of four White patients does.
  const cohort = [
    subject("PT-B1", BLACK, 1100),
    subject("PT-B2", BLACK, 1200),
    subject("PT-B3", BLACK, 1300),
    subject("PT-B4", BLACK, 2400),
    subject("PT-W1", WHITE, 1400),
    subject("PT-W2", WHITE, 2000),
    subject("PT-W3", WHITE, 2600),
    subject("PT-W4", WHITE, 3100),
  ];

  it("reports an exclusion rate per subgroup", () => {
    const row = rowFor(equityAudit(t, cohort, ASOF), "INC-anc");
    expect(row.exclusionRateBySubgroup).toEqual({ [BLACK]: 0.75, [WHITE]: 0.25 });
  });

  it("reports the widest pairwise gap in percentage points", () => {
    expect(rowFor(equityAudit(t, cohort, ASOF), "INC-anc").maxGapPoints).toBe(50);
  });

  it("carries the trial's own words as the row label", () => {
    expect(rowFor(equityAudit(t, cohort, ASOF), "INC-anc").label).toBe(
      "Absolute neutrophil count >= 1500/uL",
    );
  });

  it("scores a criterion that falls evenly at a zero gap", () => {
    expect(rowFor(equityAudit(t, cohort, ASOF), "INC-stage").maxGapPoints).toBe(0);
  });

  it("sorts the widest gap first", () => {
    expect(equityAudit(t, cohort, ASOF).map((r) => r.criterionId)).toEqual([
      "INC-anc",
      "INC-stage",
    ]);
  });

  it("measures against the otherwise-eligible, not the whole cohort", () => {
    // Two extra Black patients are the wrong stage AND below the floor. They are
    // not candidates whatever the floor says, so they must not inflate its rate.
    const withWrongStage = [
      ...cohort,
      subject("PT-B5", BLACK, 900, "IVB"),
      subject("PT-B6", BLACK, 900, "IVB"),
    ];
    expect(rowFor(equityAudit(t, withWrongStage, ASOF), "INC-anc").exclusionRateBySubgroup).toEqual({
      [BLACK]: 0.75,
      [WHITE]: 0.25,
    });
  });

  it("omits a subgroup with no otherwise-eligible patients rather than calling it 0%", () => {
    // Every Asian patient here is excluded on stage, so this floor has no
    // Asian denominator. Reporting 0% would read as "harmless for them".
    const mixed = [
      ...cohort,
      subject("PT-A1", "Asian", 900, "IVB"),
      subject("PT-A2", "Asian", 3000, "IVB"),
    ];
    const row = rowFor(equityAudit(t, mixed, ASOF), "INC-anc");
    expect(Object.keys(row.exclusionRateBySubgroup).sort()).toEqual([BLACK, WHITE]);
    expect(row.exclusionRateBySubgroup).not.toHaveProperty("Asian");
  });

  it("does not let an UNKNOWN count as an exclusion", () => {
    // Rule 4 in audit form. Two Black patients have no ANC on file at all;
    // they are otherwise eligible and not excluded, so they lower the rate.
    const withSilent = [...cohort, subject("PT-B7", BLACK, null), subject("PT-B8", BLACK, null)];
    const row = rowFor(equityAudit(t, withSilent, ASOF), "INC-anc");
    expect(row.exclusionRateBySubgroup[BLACK]).toBeCloseTo(3 / 6, 10);
  });

  it("does not let a stale fact count as an exclusion either", () => {
    const stale = patient({
      id: "PT-B9",
      age: 60,
      race: BLACK,
      facts: [
        fact({ predicate: "lab_value", analyte: "ANC", value: 800, unit: "/uL", observedAt: "2024-01-01" }),
        fact({ predicate: "staging", value: "IIIA", sourceQuote: "Stage IIIA" }),
      ],
    });
    const row = rowFor(equityAudit(t, [...cohort, stale], ASOF), "INC-anc");
    expect(row.exclusionRateBySubgroup[BLACK]).toBeCloseTo(3 / 5, 10);
  });

  it("reports a zero gap when only one subgroup has a denominator", () => {
    const onlyBlack = cohort.filter((p) => p.race === BLACK);
    const row = rowFor(equityAudit(t, onlyBlack, ASOF), "INC-anc");
    expect(row.exclusionRateBySubgroup).toEqual({ [BLACK]: 0.75 });
    expect(row.maxGapPoints).toBe(0);
  });

  it("takes the widest pairwise gap across three or more subgroups", () => {
    const three = [
      subject("PT-B1", BLACK, 1100),
      subject("PT-B2", BLACK, 1200), // 2/2 excluded
      subject("PT-W1", WHITE, 1400),
      subject("PT-W2", WHITE, 2000), // 1/2 excluded
      subject("PT-A1", "Asian", 2000),
      subject("PT-A2", "Asian", 2100), // 0/2 excluded
    ];
    const row = rowFor(equityAudit(t, three, ASOF), "INC-anc");
    expect(row.exclusionRateBySubgroup).toEqual({ Asian: 0, [BLACK]: 1, [WHITE]: 0.5 });
    expect(row.maxGapPoints).toBe(100);
  });

  it("emits a row per criterion even when nothing is excluded", () => {
    const allClear = [subject("PT-W1", WHITE, 3000), subject("PT-B1", BLACK, 3000)];
    const rows = equityAudit(t, allClear, ASOF);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.maxGapPoints === 0)).toBe(true);
  });

  it("is empty-cohort safe, with no subgroups and no gap", () => {
    const rows = equityAudit(t, [], ASOF);
    expect(rows).toHaveLength(2);
    expect(rows[0].exclusionRateBySubgroup).toEqual({});
    expect(rows[0].maxGapPoints).toBe(0);
  });

  it("returns rows the frozen EquityRow schema accepts", () => {
    for (const row of equityAudit(t, cohort, ASOF)) {
      expect(() => EquityRowSchema.parse(row)).not.toThrow();
    }
  });

  it("is deterministic and does not mutate the cohort", () => {
    const before = JSON.stringify(cohort);
    expect(equityAudit(t, cohort, ASOF)).toEqual(equityAudit(t, cohort, ASOF));
    expect(JSON.stringify(cohort)).toBe(before);
  });
});

describe("equityAuditAcross", () => {
  const cohort = [
    subject("PT-B1", BLACK, 1100),
    subject("PT-B2", BLACK, 2400),
    subject("PT-W1", WHITE, 2000),
    subject("PT-W2", WHITE, 2600),
  ];

  const strict = trial({ nctId: "NCT00000001", criteria: [ancFloor] });
  const lenient = trial({
    nctId: "NCT00000002",
    criteria: [{ ...ancFloor, value: 1000 }],
  });

  it("namespaces criterion ids by trial, so EXC-1 is not averaged across protocols", () => {
    const rows = equityAuditAcross([strict, lenient], cohort, ASOF);
    expect(rows.map((r) => r.criterionId).sort()).toEqual([
      "NCT00000001:INC-anc",
      "NCT00000002:INC-anc",
    ]);
  });

  it("ranks the stricter protocol's version of the same criterion above the looser one", () => {
    const rows = equityAuditAcross([strict, lenient], cohort, ASOF);
    expect(rows[0].criterionId).toBe("NCT00000001:INC-anc");
    expect(rows[0].maxGapPoints).toBe(50);
    expect(rows[1].maxGapPoints).toBe(0);
  });

  it("is deterministic across equal gaps, falling back to the id", () => {
    const a = trial({ nctId: "NCT00000003", criteria: [ancFloor] });
    const b = trial({ nctId: "NCT00000001", criteria: [ancFloor] });
    expect(equityAuditAcross([a, b], cohort, ASOF).map((r) => r.criterionId)).toEqual([
      "NCT00000001:INC-anc",
      "NCT00000003:INC-anc",
    ]);
  });
});

describe("builders validate against the frozen schemas", () => {
  it("accepts a leaf the builder produced", () => {
    expect(() => assertValidLeaf(ancFloor)).not.toThrow();
  });

  it("rejects a leaf with an out-of-range tier, so a bad test fails as a bad test", () => {
    expect(() => assertValidLeaf({ ...ancFloor, tier: 9 as never })).toThrow();
  });

  it("rejects a leaf with an empty sourceSpan — a citation is not optional", () => {
    expect(() => assertValidLeaf({ ...ancFloor, sourceSpan: "" })).toThrow();
  });
});

describe("audit edges", () => {
  it("counts a criterion that excludes nobody at a zero rate, not as missing", () => {
    const harmless = leaf({
      id: "INC-always",
      predicate: "age",
      operator: ">=",
      value: 18,
      tier: 0,
      sourceSpan: "Age >= 18",
    });
    const t = trial({ nctId: "NCT00000009", criteria: [harmless] });
    const row = rowFor(equityAudit(t, [subject("PT-1", WHITE, 3000)], ASOF), "INC-always");
    expect(row.exclusionRateBySubgroup).toEqual({ [WHITE]: 0 });
    expect(row.maxGapPoints).toBe(0);
  });

  it("rounds the gap to one decimal rather than leaking float noise", () => {
    // 1/3 against 0 is 33.333…%, which must read as 33.3 in a table.
    const t = trial({ nctId: "NCT00000010", criteria: [ancFloor, stageOk] });
    const cohort = [
      subject("PT-B1", BLACK, 1100),
      subject("PT-B2", BLACK, 2000),
      subject("PT-B3", BLACK, 2000),
      subject("PT-W1", WHITE, 2000),
    ];
    const row = rowFor(equityAudit(t, cohort, ASOF), "INC-anc");
    expect(row.maxGapPoints).toBe(33.3);
    expect(String(row.maxGapPoints)).not.toMatch(/\d{5,}/);
  });

  it("handles a cohort where every patient shares one race", () => {
    const t = trial({ nctId: "NCT00000011", criteria: [ancFloor, stageOk] });
    const row = rowFor(
      equityAudit(t, [subject("PT-1", WHITE, 1100), subject("PT-2", WHITE, 2000)], ASOF),
      "INC-anc",
    );
    expect(Object.keys(row.exclusionRateBySubgroup)).toEqual([WHITE]);
    expect(row.maxGapPoints).toBe(0);
  });
});
